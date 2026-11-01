// Pure query-generation logic for transl8.
// No DOM access here on purpose: this module is imported by both the browser
// app (app.js) and the node test suite (tests/querygen.test.mjs).

export const OPERATORS = ['and', 'or', 'not'];

// provider.not_style -- how a negation attaches to a term
const NOT_PREFIX = 'prefix';   // NOT field:"v"   (censys, netlas, urlscan, criminalip)
const NOT_TIGHT = 'tight';     // !field:"v"      (onyphe)
const NOT_KV = 'kv';           // field!="v"      (fofa, hunter)
export const NOT_STYLES = [NOT_PREFIX, NOT_TIGHT, NOT_KV];

// provider.or_style -- how a disjunction is expressed
const OR_INFIX = 'infix';              // a OR b
const OR_TERM_PREFIX = 'term-prefix';  // ?a ?b   (onyphe)
export const OR_STYLES = [OR_INFIX, OR_TERM_PREFIX];

export function escapeValue(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// btoa() is latin1-only and throws on anything above U+00FF, which killed the
// fofa "open" button for non-ascii values. Encode to UTF-8 bytes first.
export function toBase64Utf8(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

// Tolerate hand-edited / truncated ?queries= URL state instead of throwing.
export function normalizeRows(formRows) {
  if (!Array.isArray(formRows)) return [];
  return formRows
    .filter(r => r && typeof r === 'object' && typeof r.keyword === 'string')
    .map(r => ({
      keyword: r.keyword,
      value: r.value == null ? '' : String(r.value),
      operator: OPERATORS.includes(r.operator) ? r.operator : undefined,
    }));
}

function defFor(queryDefs, keyword) {
  return queryDefs.find(q => q.keyword === keyword);
}

// What goes *between* two terms. Returns null when the provider cannot express
// the requested operator at all.
//
// 'and', 'not' and "no operator set" all join conjunctively. A provider with no
// explicit AND keyword (onyphe, criminalip's default) falls back to its
// query_separator, which is an implicit AND -- semantically safe. OR gets no
// such fallback: silently turning OR into a space would change the result set.
function joinerFor(provider, operator) {
  const separator = provider.query_separator || ' ';
  if (operator === 'or') {
    // With term-prefix OR the marker rides on each term, so the terms
    // themselves are still joined by the ordinary separator.
    if (provider.or_style === OR_TERM_PREFIX) {
      return provider['operators/or'] ? separator : null;
    }
    const or = provider['operators/or'];
    return or ? ` ${or} ` : null;
  }
  if (operator === 'and' || operator === 'not') {
    const and = provider['operators/and'];
    return and ? ` ${and} ` : separator;
  }
  return separator;
}

function renderTerm({ provider, def, keyword, value, negate, orMark, countries }) {
  let fieldValue = value;
  if (keyword === 'asn' && provider.as_includeprefix === 'TRUE') fieldValue = `AS${value}`;
  if (provider.name === 'quake360' && keyword === 'country') fieldValue = countries[value.toUpperCase()];

  const field = def[provider.name];
  const not = provider['operators/not'];
  const style = provider.not_style || NOT_PREFIX;
  const freeform = field === 'freeform';
  // Some engines reserve quotes for free-text/banner terms and want bare
  // filter values (criminalip). Free-text terms are always quoted.
  const quoted = freeform || provider.quote_values !== 'FALSE';
  // Escape either way: an unquoted criminalip filter value containing a bare
  // double quote would otherwise be read as the start of a banner term.
  const v = quoted ? `"${escapeValue(fieldValue)}"` : escapeValue(fieldValue);
  const mark = orMark ? provider['operators/or'] : '';

  if (freeform) {
    return negate ? `${mark}${not} ${v}` : `${mark}${v}`;
  }
  if (negate && style === NOT_KV) return `${mark}${field}${not}${v}`;
  if (negate && style === NOT_TIGHT) return `${mark}${not}${field}${provider.kv_separator}${v}`;

  const term = `${mark}${field}${provider.kv_separator}${v}`;
  return negate ? `${not} ${term}` : term;
}

function evaluateProvider({ provider, rows, queryDefs, countries }) {
  const active = rows.filter(r => r.value.trim() !== '');
  const unsupported = [];
  const add = reason => { if (!unsupported.includes(reason)) unsupported.push(reason); };

  // Keyword support is checked against every row, including ones with no value
  // yet, so the card tells you up front that a provider lacks the field.
  for (const row of rows) {
    const def = defFor(queryDefs, row.keyword);
    if (!def || !def[provider.name]) add(row.keyword);
  }

  // Value constraints only apply where there is a value to check.
  for (const row of active) {
    const def = defFor(queryDefs, row.keyword);
    if (def?.constraint && !new RegExp(def.constraint).test(row.value)) {
      add(`${row.keyword} (invalid: ${row.value})`);
    }
    if (provider.name === 'quake360' && row.keyword === 'country' && !countries[row.value.toUpperCase()]) {
      add(`${row.keyword} (unknown code: ${row.value})`);
    }
  }

  // Operators are only checked when they actually join two live terms, so an
  // empty row no longer vetoes a whole provider.
  active.forEach((row, i) => {
    if (row.operator === 'or' && i > 0 && !joinerFor(provider, 'or')) add('operator OR');
    if (row.operator === 'not' && !provider['operators/not']) add('operator NOT');
  });

  // Every live term negated means a pure-negation query ("everything except
  // X"), which none of these engines will run -- they all need a positive
  // clause to match against. Say so rather than emitting a query that 404s.
  if (active.length && active.every(r => r.operator === 'not')) add('negation-only query');

  if (unsupported.length) {
    return { provider, queryText: '', unavailable: true, reason: `unsupported: ${unsupported.join(', ')}` };
  }

  // With term-prefix OR, "a OR b" is written "?a ?b", so the marker belongs on
  // both sides of the disjunction -- the term carrying the operator and the one
  // before it. Chained ORs mark every member of the run.
  const termPrefixOr = provider.or_style === OR_TERM_PREFIX;
  const orMarks = active.map((row, i) =>
    termPrefixOr && (row.operator === 'or' || active[i + 1]?.operator === 'or'));

  let queryText = '';
  active.forEach((row, i) => {
    const def = defFor(queryDefs, row.keyword);
    // i === 0 has nothing to its left, so it never takes a joiner -- this is
    // what stopped blank leading rows emitting "and port:\"53\"".
    if (i > 0) queryText += joinerFor(provider, row.operator);
    queryText += renderTerm({
      provider, def,
      keyword: row.keyword,
      value: row.value,
      negate: row.operator === 'not',
      orMark: orMarks[i],
      countries,
    });
  });

  return { provider, queryText: queryText.trim(), unavailable: false, reason: '' };
}

export function buildQueries({ queryDefs, providerDefs, countries, formRows }) {
  const rows = normalizeRows(formRows);
  return providerDefs
    .map(provider => evaluateProvider({ provider, rows, queryDefs, countries }))
    .filter(r => r.queryText || r.unavailable);
}
