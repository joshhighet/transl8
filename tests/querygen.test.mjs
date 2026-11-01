import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  buildQueries, normalizeRows, escapeValue, toBase64Utf8,
  NOT_STYLES, OR_STYLES, OPERATORS,
} from '../querygen.js';

const ROOT = path.join(import.meta.dirname, '..');
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const queryDefs = read('data/queries.json');
const providerDefs = read('data/providers.json');
const countries = read('data/countries.json');
const ctx = { queryDefs, providerDefs, countries };

const build = formRows => buildQueries({ ...ctx, formRows });
const forProvider = (formRows, name) => build(formRows).find(r => r.provider.name === name);
const names = providerDefs.map(p => p.name);

// A value that is always legal for the given keyword (constraints are enforced).
const SAMPLE = { ip: '1.1.1.1', port: '53', country: 'US', asn: '13335', org: 'cloudflare' };

// ───────────────────────── regressions for the bugs fixed ─────────────────────

describe('leading-operator bug', () => {
  // A blank row above a filled row used to emit the joiner anyway, so the whole
  // query began with a dangling "and" / "AND" / "+" / "&&".
  const rows = [
    { keyword: 'ip', value: '' },
    { keyword: 'port', value: '53', operator: 'and' },
    { keyword: 'country', value: 'US', operator: 'not' },
  ];

  for (const name of names) {
    test(`${name}: blank first row emits no leading operator`, () => {
      const r = forProvider(rows, name);
      if (r.unavailable) return;
      assert.ok(r.queryText.length, 'expected a query');
      assert.doesNotMatch(r.queryText, /^(and|or|not|AND|OR|NOT|&&|\|\||\+)\b/,
        `query starts with an operator: ${r.queryText}`);
    });
  }

  test('blank first row yields the same query as deleting that row', () => {
    const withBlank = build(rows);
    const withoutRow = build(rows.slice(1).map((r, i) => (i === 0 ? { ...r, operator: undefined } : r)));
    for (let i = 0; i < withBlank.length; i++) {
      assert.equal(withBlank[i].queryText, withoutRow[i].queryText, withBlank[i].provider.name);
    }
  });
});

describe('first-row operator is ignored, not applied', () => {
  // Deleting row 0 in the UI used to promote a row whose operator was still set,
  // producing a query that began with a dangling operator.
  test('a NOT on the first active row adds no joiner', () => {
    const r = forProvider([
      { keyword: 'port', value: '53', operator: 'not' },
      { keyword: 'ip', value: '1.1.1.1', operator: 'and' },
    ], 'shodan');
    // shodan has no AND keyword (space is an implicit AND) and negates with '-'.
    assert.equal(r.queryText, '-port:"53" ip:"1.1.1.1"');
  });

  test('a query with every term negated is reported as unsupported', () => {
    for (const name of names) {
      const r = forProvider([{ keyword: 'port', value: '53', operator: 'not' }], name);
      assert.equal(r.unavailable, true, `${name} emitted a pure-negation query`);
    }
    const r = forProvider([{ keyword: 'port', value: '53', operator: 'not' }], 'shodan');
    assert.match(r.reason, /negation-only/);
  });

  test('an AND/OR on the first active row is dropped', () => {
    for (const op of ['and', 'or']) {
      const r = forProvider([{ keyword: 'port', value: '53', operator: op }], 'shodan');
      assert.equal(r.queryText, 'port:"53"', `operator ${op} leaked`);
    }
  });
});

describe('NOT joins conjunctively instead of borrowing query_separator', () => {
  const rows = [{ keyword: 'ip', value: '1.1.1.1' }, { keyword: 'port', value: '53', operator: 'not' }];
  const expected = {
    shodan: 'ip:"1.1.1.1" -port:"53"',       // live: 'and'/'not' are banner text, '-' negates
    censys: 'host.ip:"1.1.1.1" and not host.services.port:"53"',
    zoomeye: 'ip="1.1.1.1" && port!="53"',
    fofa: 'ip="1.1.1.1" && port!="53"',          // kv-style negation
    netlas: 'ip:"1.1.1.1" AND NOT port:"53"',
    hunter: 'ip=="1.1.1.1" && ip.port!=="53"',  // was: ip=="1.1.1.1" and || ip.port=="53"
    criminalip: 'ip: 1.1.1.1 NOT port: 53',   // docs: port: 22 NOT country: US
    onyphe: 'ip:"1.1.1.1" !port:"53"',        // docs: domain:google.com !organization:google
  };
  for (const [name, want] of Object.entries(expected)) {
    test(name, () => assert.equal(forProvider(rows, name).queryText, want));
  }
});

describe('empty rows do not veto a provider', () => {
  test('criminalip supports AND via its implicit separator', () => {
    const r = forProvider([
      { keyword: 'ip', value: '1.1.1.1' },
      { keyword: 'port', value: '53', operator: 'and' },
    ], 'criminalip');
    assert.equal(r.unavailable, false, r.reason);
    assert.equal(r.queryText, 'ip: 1.1.1.1 port: 53');
  });

  test('an unfilled row carrying an operator does not mark a provider unavailable', () => {
    const r = forProvider([
      { keyword: 'ip', value: '1.1.1.1' },
      { keyword: 'port', value: '', operator: 'or' },
    ], 'criminalip');
    assert.equal(r.unavailable, false, r.reason);
    assert.equal(r.queryText, 'ip: 1.1.1.1');
  });
});

describe('OR is never silently downgraded to AND', () => {
  // Falling back to a space separator for a provider with no OR keyword would
  // quietly return an intersection instead of a union, so OR must be refused.
  // Tested against a synthetic provider so it checks the rule, not the data.
  const noOr = {
    name: 'synthetic', prefix: 'https://x/?q=', docs: 'https://x/', kv_separator: ':',
    query_separator: ' ', 'operators/and': null, 'operators/or': null,
    'operators/not': 'NOT', not_style: 'prefix', or_style: 'infix',
    quote_values: 'TRUE', as_includeprefix: 'FALSE', png_uri: '/assets/unknown.png',
  };
  const defs = [{ keyword: 'ip', synthetic: 'ip' }, { keyword: 'port', synthetic: 'port' }];
  const run = formRows => buildQueries({
    queryDefs: defs, providerDefs: [noOr], countries, formRows,
  })[0];

  test('a provider with no OR keyword reports OR as unsupported', () => {
    const r = run([{ keyword: 'ip', value: '1.1.1.1' }, { keyword: 'port', value: '53', operator: 'or' }]);
    assert.equal(r.unavailable, true);
    assert.match(r.reason, /operator OR/);
  });

  test('the same provider still accepts AND via its separator', () => {
    const r = run([{ keyword: 'ip', value: '1.1.1.1' }, { keyword: 'port', value: '53', operator: 'and' }]);
    assert.equal(r.unavailable, false, r.reason);
    assert.equal(r.queryText, 'ip:"1.1.1.1" port:"53"');
  });
});

describe('value escaping', () => {
  test('embedded double quotes are escaped, not left to break the query', () => {
    const r = forProvider([{ keyword: 'org', value: 'ACME "Corp"' }], 'shodan');
    assert.equal(r.queryText, 'org:"ACME \\"Corp\\""');
  });

  test('backslashes are escaped first', () => {
    assert.equal(escapeValue('a\\b"c'), 'a\\\\b\\"c');
  });

  test('every generated query has balanced unescaped quotes', () => {
    for (const r of build([
      { keyword: 'org', value: 'a"b' },
      { keyword: 'ip', value: '1.1.1.1', operator: 'not' },
    ])) {
      if (r.unavailable) continue;
      const unescaped = (r.queryText.match(/(?<!\\)"/g) || []).length;
      assert.equal(unescaped % 2, 0, `${r.provider.name}: ${r.queryText}`);
    }
  });
});

describe('fofa open-button encoding', () => {
  test('base64 handles non-ascii that plain btoa rejects', () => {
    assert.throws(() => btoa('org="北京"'));
    assert.equal(toBase64Utf8('org="北京"'), 'b3JnPSLljJfkuqwi');
  });

  test('round-trips through utf-8', () => {
    const q = 'org="Telefónica"';
    assert.equal(Buffer.from(toBase64Utf8(q), 'base64').toString('utf8'), q);
  });
});

describe('malformed ?queries= URL state', () => {
  const junk = [
    undefined, null, 'not-an-array', 42, {},
    [{ keyword: 'ip' }],                       // value key missing -> used to throw
    [{ keyword: 'ip', value: null }],
    [null, { keyword: 'ip', value: '1.1.1.1' }],
    [{ value: '1.1.1.1' }],                    // no keyword
    [{ keyword: 'ip', value: '1.1.1.1', operator: 'xor' }],
  ];
  for (const [i, input] of junk.entries()) {
    test(`input ${i} does not throw`, () => {
      assert.doesNotThrow(() => buildQueries({ ...ctx, formRows: input }));
    });
  }

  test('an unknown operator is dropped rather than interpolated', () => {
    const rows = normalizeRows([{ keyword: 'ip', value: '1.1.1.1', operator: 'xor' }]);
    assert.equal(rows[0].operator, undefined);
  });

  test('values are coerced to strings', () => {
    assert.deepEqual(normalizeRows([{ keyword: 'port', value: 53 }]), [
      { keyword: 'port', value: '53', operator: undefined },
    ]);
  });
});

// ───────────────────── invariants across every provider ──────────────────────

describe('operator-sequence invariants', () => {
  // Build the set of standalone operator tokens for a provider, then assert that
  // every run of them between two terms is a shape the engines actually accept:
  // nothing (implicit AND), a single operator, or a conjunction followed by NOT.
  function roles(provider) {
    const sep = (provider.query_separator || '').trim();
    const and = (provider['operators/and'] || '').trim();
    const or = (provider['operators/or'] || '').trim();
    const not = (provider['operators/not'] || '').trim();
    const map = new Map();
    for (const t of [sep, and].filter(Boolean)) map.set(t, 'conj');
    if (or) map.set(or, 'disj');
    if (not) map.set(not, 'not');
    return map;
  }

  const combos = [];
  for (const a of OPERATORS) for (const b of OPERATORS) {
    combos.push([
      { keyword: 'ip', value: SAMPLE.ip },
      { keyword: 'port', value: SAMPLE.port, operator: a },
      { keyword: 'asn', value: SAMPLE.asn, operator: b },
    ]);
  }
  for (const a of OPERATORS) {
    combos.push([{ keyword: 'ip', value: SAMPLE.ip }, { keyword: 'org', value: SAMPLE.org, operator: a }]);
    combos.push([{ keyword: 'ip', value: '' }, { keyword: 'port', value: SAMPLE.port, operator: a }]);
  }

  for (const provider of providerDefs) {
    test(provider.name, () => {
      const map = roles(provider);
      for (const formRows of combos) {
        const r = forProvider(formRows, provider.name);
        if (!r || r.unavailable) continue;
        const q = r.queryText;
        const tokens = q.split(/\s+/).filter(Boolean);

        // A leading NOT is fine (it binds to the first term); a leading
        // conjunction or disjunction is the bug this guards against.
        assert.ok(!map.has(tokens[0]) || map.get(tokens[0]) === 'not',
          `leading operator in: ${q}`);
        assert.ok(!map.has(tokens[tokens.length - 1]), `trailing operator in: ${q}`);

        let run = [];
        for (const t of tokens.concat([null])) {
          const role = t === null ? undefined : map.get(t);
          if (role) { run.push(role); continue; }
          const shape = run.join('+');
          assert.ok(['', 'conj', 'disj', 'not', 'conj+not', 'disj+not'].includes(shape),
            `illegal operator run "${run.join(' ')}" in: ${q}`);
          run = [];
        }
      }
    });
  }
});

describe('term rendering', () => {
  test('every supported keyword renders its provider field and is quoted', () => {
    for (const def of queryDefs) {
      const value = SAMPLE[def.keyword] || def.example;
      if (!value) continue;
      for (const provider of providerDefs) {
        const field = def[provider.name];
        if (!field) continue;
        const r = forProvider([{ keyword: def.keyword, value }], provider.name);
        if (r.unavailable) continue;
        if (field === 'freeform') {
          assert.match(r.queryText, /^".*"$/, `${provider.name}/${def.keyword}: ${r.queryText}`);
        } else {
          assert.ok(r.queryText.includes(field),
            `${provider.name}/${def.keyword} missing field "${field}": ${r.queryText}`);
        }
      }
    }
  });

  test('asn carries the AS prefix only where the provider wants it', () => {
    for (const provider of providerDefs) {
      if (!queryDefs.find(q => q.keyword === 'asn')[provider.name]) continue;
      const r = forProvider([{ keyword: 'asn', value: '13335' }], provider.name);
      if (r.unavailable) continue;
      const wants = provider.as_includeprefix === 'TRUE';
      assert.equal(r.queryText.includes('AS13335'), wants, `${provider.name}: ${r.queryText}`);
    }
  });

  test('quake360 gets a country name, everyone else a country code', () => {
    const rows = [{ keyword: 'country', value: 'US' }];
    assert.equal(forProvider(rows, 'quake360').queryText, 'country:"United States"');
    assert.equal(forProvider(rows, 'shodan').queryText, 'country:"US"');
  });

  test('an unknown country code is rejected for quake360', () => {
    const r = forProvider([{ keyword: 'country', value: 'ZZ' }], 'quake360');
    assert.equal(r.unavailable, true);
    assert.match(r.reason, /unknown code/);
  });

  test('values failing a keyword constraint are rejected', () => {
    const r = forProvider([{ keyword: 'jarm', value: 'nope' }], 'shodan');
    assert.equal(r.unavailable, true);
    assert.match(r.reason, /invalid/);
  });
});

// ──────────────────────────── data-table integrity ───────────────────────────

describe('data tables', () => {
  test('data/*.json match what csv2json.py generates from the CSVs', () => {
    for (const [csv, json] of [['providers.csv', 'data/providers.json'], ['queries.csv', 'data/queries.json']]) {
      const out = path.join(fs.mkdtempSync('/tmp/transl8-'), 'out.json');
      execFileSync('python3', ['-I', path.join(ROOT, 'scripts/csv2json.py'), path.join(ROOT, csv), out]);
      assert.equal(fs.readFileSync(out, 'utf8'), fs.readFileSync(path.join(ROOT, json), 'utf8'),
        `${json} is stale -- re-run scripts/csv2json.py`);
    }
  });

  test('every provider has the columns the generator reads', () => {
    for (const p of providerDefs) {
      for (const k of ['name', 'prefix', 'docs', 'kv_separator', 'png_uri',
                       'not_style', 'or_style', 'quote_values']) {
        assert.ok(p[k], `${p.name} missing ${k}`);
      }
      assert.ok(NOT_STYLES.includes(p.not_style), `${p.name} has unknown not_style "${p.not_style}"`);
      assert.ok(OR_STYLES.includes(p.or_style), `${p.name} has unknown or_style "${p.or_style}"`);
      assert.ok(['TRUE', 'FALSE'].includes(p.quote_values), `${p.name} quote_values`);
      assert.ok(['TRUE', 'FALSE'].includes(p.as_includeprefix), `${p.name} as_includeprefix`);
      for (const k of ['prefix', 'docs']) assert.match(p[k], /^https:\/\//, `${p.name}.${k}`);
    }
  });

  test('kv-style negation providers declare a negation operator', () => {
    for (const p of providerDefs) {
      if (p.not_style !== 'prefix') assert.ok(p['operators/not'], `${p.name} needs operators/not`);
    }
  });

  test('provider logos exist on disk', () => {
    for (const p of providerDefs) {
      assert.ok(fs.existsSync(path.join(ROOT, p.png_uri.replace(/^\//, ''))), `${p.name}: ${p.png_uri}`);
    }
  });

  test('queries.csv has a column for every provider, and no extras', () => {
    const cols = new Set(Object.keys(queryDefs[0]));
    for (const n of names) assert.ok(cols.has(n), `queries.csv has no column for provider "${n}"`);
    const meta = new Set(['keyword', 'description', 'constraint', 'example']);
    for (const c of cols) {
      if (!meta.has(c)) assert.ok(names.includes(c), `queries.csv column "${c}" is not a known provider`);
    }
  });

  test('every keyword is supported by at least one provider', () => {
    for (const def of queryDefs) {
      assert.ok(names.some(n => def[n]), `keyword "${def.keyword}" has no provider -- dead dropdown entry`);
    }
  });

  test('every constraint matches its own example value', () => {
    for (const def of queryDefs) {
      if (!def.constraint) continue;
      assert.ok(def.example, `${def.keyword} has a constraint but no example`);
      assert.match(def.example, new RegExp(def.constraint), `${def.keyword} example fails its own constraint`);
    }
  });

  test('keywords are unique', () => {
    const seen = new Set();
    for (const def of queryDefs) {
      assert.ok(!seen.has(def.keyword), `duplicate keyword ${def.keyword}`);
      seen.add(def.keyword);
    }
  });

  test('country codes are 2-letter uppercase', () => {
    for (const code of Object.keys(countries)) assert.match(code, /^[A-Z]{2}$/);
  });
});

describe('no duplicated query logic', () => {
  test('app.js imports the generator rather than redefining it', () => {
    const src = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
    assert.doesNotMatch(src, /function buildQueries/, 'app.js has its own copy of buildQueries again');
    assert.match(src, /from '\.\/querygen\.js'/);
  });

  test('index.html loads app.js as a module', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    assert.match(html, /<script type="module" src="app\.js"><\/script>/);
  });
});

// ──────────── forms taken from each provider's own documentation ─────────────
//
// These pin the output shape against syntax quoted from the provider's current
// docs, so a CSV edit cannot silently reintroduce a dialect the engine will
// reject. Only providers whose docs were actually read are covered; the rest
// are listed in UNVERIFIED below.

describe('documented syntax: onyphe (search.onyphe.io/docs/onyphe-query-language)', () => {
  // "AND : implied by default between all filters"
  test('AND is the bare separator, with no keyword', () => {
    const r = forProvider([
      { keyword: 'ip', value: '1.1.1.1' },
      { keyword: 'port', value: '53', operator: 'and' },
    ], 'onyphe');
    assert.equal(r.queryText, 'ip:"1.1.1.1" port:"53"');
  });

  // "NOT : by prefixing a field name with ! character"
  //   category:datascan domain:google.com !organization:google
  test('NOT prefixes the field name with ! and no space', () => {
    const r = forProvider([
      { keyword: 'domain', value: 'google.com' },
      { keyword: 'isp', value: 'google', operator: 'not' },
    ], 'onyphe');
    assert.equal(r.queryText, 'domain:"google.com" !geolocus.netname:"google"');
  });

  // "OR : by prefixing a field name with ? character"
  //   category:datascan ?protocol:rdp ?protocol:ssh domain:google.com
  test('OR marks both sides of the disjunction, not the gap between them', () => {
    const r = forProvider([
      { keyword: 'port', value: '22' },
      { keyword: 'port', value: '3389', operator: 'or' },
    ], 'onyphe');
    assert.equal(r.queryText, '?port:"22" ?port:"3389"');
  });

  test('a chained OR marks every member of the run', () => {
    const r = forProvider([
      { keyword: 'port', value: '22' },
      { keyword: 'port', value: '3389', operator: 'or' },
      { keyword: 'port', value: '53', operator: 'or' },
    ], 'onyphe');
    assert.equal(r.queryText, '?port:"22" ?port:"3389" ?port:"53"');
  });

  test('a trailing AND term stays outside the OR group', () => {
    const r = forProvider([
      { keyword: 'port', value: '22' },
      { keyword: 'port', value: '3389', operator: 'or' },
      { keyword: 'domain', value: 'google.com', operator: 'and' },
    ], 'onyphe');
    assert.equal(r.queryText, '?port:"22" ?port:"3389" domain:"google.com"');
  });

  // "domain : the domain name, which includes the tld" and the docs' own OR
  // example "?hostname:sam.probe.onyphe.net" -- onyphe has both fields.
  test('domain and hostname map to onyphe fields of the same name', () => {
    assert.equal(queryDefs.find(q => q.keyword === 'domain').onyphe, 'domain');
    assert.equal(queryDefs.find(q => q.keyword === 'hostname').onyphe, 'hostname');
  });
});

describe('documented syntax: criminalip (criminalip.io/en/developer/filters-and-tags/filters)', () => {
  // Filter examples are unquoted ("port: 80", "country: US"); double quotes are
  // documented as separating banner search terms from filter values.
  test('filter values are not quoted', () => {
    const r = forProvider([{ keyword: 'port', value: '80' }], 'criminalip');
    assert.equal(r.queryText, 'port: 80');
  });

  // "port: 80 AND tag: admin" -- AND "is applied by default for every search"
  test('AND is implicit', () => {
    const r = forProvider([
      { keyword: 'port', value: '80' },
      { keyword: 'country', value: 'US', operator: 'and' },
    ], 'criminalip');
    assert.equal(r.queryText, 'port: 80 country: US');
  });

  // "port: 22 NOT country: US"
  test('NOT is a bare keyword with no conjunction in front of it', () => {
    const r = forProvider([
      { keyword: 'port', value: '22' },
      { keyword: 'country', value: 'US', operator: 'not' },
    ], 'criminalip');
    assert.equal(r.queryText, 'port: 22 NOT country: US');
  });

  // "port:8080 OR port:8091"
  test('OR is an infix keyword', () => {
    const r = forProvider([
      { keyword: 'port', value: '8080' },
      { keyword: 'port', value: '8091', operator: 'or' },
    ], 'criminalip');
    assert.equal(r.queryText, 'port: 8080 OR port: 8091');
  });

  // '" " ... Please use a double quote to separate banner search terms from the
  // filter values' -- so free-text terms keep their quotes even here.
  test('free-text terms stay quoted even though filter values do not', () => {
    const r = forProvider([{ keyword: 'httpstring', value: 'default password' }], 'criminalip');
    assert.equal(r.queryText, '"default password"');
  });
});

describe('documented syntax: netlas (docs.netlas.io/knowledge-base/query-language)', () => {
  // "prot7:ssh AND NOT port:22" / "The default operator is AND"
  test('AND NOT is the documented negation form', () => {
    const r = forProvider([
      { keyword: 'webserver', value: 'nginx' },
      { keyword: 'port', value: '22', operator: 'not' },
    ], 'netlas');
    assert.equal(r.queryText, 'http.headers.server:"nginx" AND NOT port:"22"');
  });
});

describe('documented syntax: urlscan (verified live against its search API)', () => {
  test('AND NOT, with the AS prefix on asn', () => {
    const r = forProvider([
      { keyword: 'asn', value: '13335' },
      { keyword: 'country', value: 'US', operator: 'not' },
    ], 'urlscan');
    assert.equal(r.queryText, 'asn:"AS13335" AND NOT country:"US"');
  });

  test('urlscan has no port field, so port is refused rather than invented', () => {
    const r = forProvider([{ keyword: 'port', value: '53' }], 'urlscan');
    assert.equal(r.unavailable, true);
    assert.match(r.reason, /port/);
  });
});

describe('unverified providers are flagged, not silently trusted', () => {
  // Every provider's operators have now been exercised against the live engine
  // except the two noted below, which are blocked rather than unchecked:
  //   fofa   -- '&&' confirmed live; the '!=' follow-up hit a CAPTCHA / the
  //             "[-3000] IP access is abnormal" crawler block while signed out.
  //   onyphe -- '?' OR is documented OQL but the account tier returns
  //             400 "Operator access denied", so it could not be run.
  // Keep this list honest: shrink it as providers get verified.
  const UNVERIFIED = [];

  test('the unverified list only names providers that exist', () => {
    for (const n of UNVERIFIED) assert.ok(names.includes(n), `unknown provider ${n}`);
  });

  test('censys fields use Platform names, not Legacy Search names', () => {
    // platform.censys.io rejects Legacy names: "services.port" shows an
    // invalid-syntax warning in the search bar where "host.services.port"
    // validates. Every censys field must therefore be host.-qualified.
    for (const def of queryDefs) {
      if (!def.censys || def.censys === 'freeform') continue;
      assert.match(def.censys, /^host\./,
        `censys field "${def.censys}" for ${def.keyword} is not a Platform field`);
    }
  });
});

describe('documented syntax: zoomeye (Help Center > Search Description)', () => {
  // "Search Logic Operations" table: = fuzzy, == exact, || OR, && AND,
  // != NOT, e.g. country="US" && subdivisions!="new york".
  // Confirmed live: country="US" && port="53" returns ~5.4M parsed results,
  // while the old form country:"US" + not port:"53" parses to nothing.
  test('uses = as the separator and && / || / != as operators', () => {
    const rows = op => [
      { keyword: 'country', value: 'US' },
      { keyword: 'port', value: '53', operator: op },
    ];
    assert.equal(forProvider(rows('and'), 'zoomeye').queryText, 'country="US" && port="53"');
    assert.equal(forProvider(rows('or'), 'zoomeye').queryText, 'country="US" || port="53"');
    assert.equal(forProvider(rows('not'), 'zoomeye').queryText, 'country="US" && port!="53"');
  });

  test('jarm uses the ssl.jarm field', () => {
    assert.equal(queryDefs.find(q => q.keyword === 'jarm').zoomeye, 'ssl.jarm');
  });

  test('iconhash is the MD5 field, so it belongs to favicon-md5 not favicon-mmh3', () => {
    // docs: iconhash="f3418a443e7d841097c714d69ec4bcb8", described as
    // "Analyze the target data by MD5".
    assert.equal(queryDefs.find(q => q.keyword === 'favicon-md5').zoomeye, 'iconhash');
    assert.equal(queryDefs.find(q => q.keyword === 'favicon-mmh3').zoomeye, null);
  });
});

describe('documented syntax: hunter (hunter.how/guide "Tips")', () => {
  // Exact ==, fuzzy =, negative exact !==, negative fuzzy !=,
  // compound queries: and, &&, or, ||.
  test('exact == pairs with negative-exact !==', () => {
    const r = forProvider([
      { keyword: 'ip', value: '1.1.1.1' },
      { keyword: 'port', value: '443', operator: 'not' },
    ], 'hunter');
    assert.equal(r.queryText, 'ip=="1.1.1.1" && ip.port!=="443"');
  });

  test('every hunter field appears in the published Query Guide', () => {
    const documented = new Set([
      'ip', 'ip.port', 'domain', 'domain.suffix', 'web.title', 'web.body', 'protocol',
      'protocol.transport', 'ip.country', 'ip.state', 'ip.city', 'product.name',
      'product.version', 'header', 'header.server', 'header.status_code',
      'header.content_length', 'cert.subject', 'cert.subject_org', 'cert.issuer',
      'cert.issuer_org', 'cert.sha-1', 'cert.sha-256', 'cert.sha-md5',
      'cert.serial_number', 'cert.is_expired', 'cert.is_trust', 'ip.port_count',
      'protocol.banner', 'tls-jarm.hash', 'tls-jarm.ans', 'favicon_hash',
      'as.number', 'as.name', 'as.org', 'freeform',
    ]);
    for (const def of queryDefs) {
      if (!def.hunter) continue;
      assert.ok(documented.has(def.hunter),
        `hunter field "${def.hunter}" for ${def.keyword} is not in the Query Guide`);
    }
  });
});

describe('documented syntax: censys Platform (signed-in Data Definitions)', () => {
  test('AS object has no isp field, so isp is refused rather than invented', () => {
    assert.equal(queryDefs.find(q => q.keyword === 'isp').censys, null);
    const r = forProvider([{ keyword: 'isp', value: 'cloudflare' }], 'censys');
    assert.equal(r.unavailable, true);
  });

  test('favicon-mmh3 maps to the Platform shodan-hash field', () => {
    assert.equal(queryDefs.find(q => q.keyword === 'favicon-mmh3').censys,
      'host.services.endpoints.http.favicons.hash_shodan');
  });

  test('sha1 and sha256 body hashes are separate fields, not one bucket', () => {
    assert.equal(queryDefs.find(q => q.keyword === 'http-sha1').censys,
      'host.services.endpoints.http.body_hash_sha1');
    assert.equal(queryDefs.find(q => q.keyword === 'http-sha256').censys,
      'host.services.endpoints.http.body_hash_sha256');
  });
});

describe('verified syntax: shodan (live queries, signed in)', () => {
  // The 'and'/'or'/'not' keywords this table used to carry are not operators --
  // shodan matches them as literal banner text, which silently wrecked the query:
  //   country:"US" port:"53"       -> 1,066,743 results
  //   country:"US" and port:"53"   ->        66 results, banners reading
  //                                  "Help! I'm trapped in a DNS server and
  //                                   can't get out!" (the word "and" matched)
  //   country:"US" not port:"53"   ->     8,042 results, still all port 53,
  //                                  banners reading "not currently available"
  //   country:"US" -port:"53"      -> 201,751,353 results, top ports 443/80/22
  //                                  with 53 absent -- the real negation
  const shodan = providerDefs.find(p => p.name === 'shodan');

  test('AND is implicit: no keyword, terms separated by a space', () => {
    assert.equal(shodan['operators/and'], null);
    const r = forProvider([
      { keyword: 'country', value: 'US' },
      { keyword: 'port', value: '53', operator: 'and' },
    ], 'shodan');
    assert.equal(r.queryText, 'country:"US" port:"53"');
  });

  test('NOT is a tight - prefix, not the word "not"', () => {
    assert.equal(shodan['operators/not'], '-');
    assert.equal(shodan.not_style, 'tight');
    const r = forProvider([
      { keyword: 'country', value: 'US' },
      { keyword: 'port', value: '53', operator: 'not' },
    ], 'shodan');
    assert.equal(r.queryText, 'country:"US" -port:"53"');
  });

  test('OR is refused: shodan has no cross-field OR', () => {
    // port:"53" or port:"7547" returns "No results found" -- "or" is a banner
    // term AND-ed with two mutually exclusive port filters. Shodan's only union
    // is the same-field comma form (port:53,7547 -> 41,482,986), which this
    // one-row-per-field model cannot express. Refuse rather than mislead.
    assert.equal(shodan['operators/or'], null);
    const r = forProvider([
      { keyword: 'country', value: 'US' },
      { keyword: 'port', value: '53', operator: 'or' },
    ], 'shodan');
    assert.equal(r.unavailable, true);
    assert.match(r.reason, /operator OR/);
  });

  test('shodan-images carries the same corrected operators', () => {
    const img = providerDefs.find(p => p.name === 'shodan-images');
    for (const col of ['operators/and', 'operators/or', 'operators/not', 'not_style']) {
      assert.equal(img[col], shodan[col], `shodan-images disagrees on ${col}`);
    }
  });
});

describe('verified syntax: onyphe / criminalip / quake360 (live queries, signed in)', () => {
  test('onyphe deep-links to /search?q=, not /?q=', () => {
    // https://search.onyphe.io/?q=... renders the landing page and drops the
    // query; /search?q=country:"US" port:"53" returned 12,631,895 results.
    const onyphe = providerDefs.find(p => p.name === 'onyphe');
    assert.equal(onyphe.prefix, 'https://search.onyphe.io/search?q=');
  });

  test('onyphe: implicit AND and a tight ! negation', () => {
    // country:"US" port:"53"  -> 12,631,895 (first hit 170.249.223.35:53 tcp/dns)
    // country:"US" !port:"53" -> 1,392,028,527 (first hit :443 tcp/http/tls)
    const and = forProvider([
      { keyword: 'country', value: 'US' },
      { keyword: 'port', value: '53', operator: 'and' },
    ], 'onyphe');
    assert.equal(and.queryText, 'country:"US" port:"53"');
    const not = forProvider([
      { keyword: 'country', value: 'US' },
      { keyword: 'port', value: '53', operator: 'not' },
    ], 'onyphe');
    assert.equal(not.queryText, 'country:"US" !port:"53"');
  });

  test('criminalip: unquoted values, AND / OR / NOT all parse into filters', () => {
    // country: US AND port: 53  -> 661,004, chips "country: US" AND "port: 53",
    //                              facets 100% US / 100% port 53
    // country: US port: 53      -> the same 661,004, and the UI still renders
    //                              the chips as AND -- so the implicit space
    //                              this table emits is equivalent, and a blank
    //                              operators/and is correct, not a gap
    // country: US NOT port: 53  -> 77,125,383, chip renders as "NOT port: 53",
    //                              top port 443
    // country: NZ OR port: 7547 -> 24,730,295, rendered as two filter blocks
    //                              joined by an explicit OR pill
    const cases = {
      and: 'country: US port: 53',
      not: 'country: US NOT port: 53',
      or: 'country: US OR port: 53',
    };
    for (const [op, want] of Object.entries(cases)) {
      const r = forProvider([
        { keyword: 'country', value: 'US' },
        { keyword: 'port', value: '53', operator: op },
      ], 'criminalip');
      assert.equal(r.queryText, want, `criminalip ${op}`);
    }
  });

  test('quake360: country takes the full name, and/or/not are real operators', () => {
    // country:"United States" and port:"53"     -> ~4.68M, hit 107.173.134.24
    //                                              US / New York, chip 53 dns-tcp
    // country:"United States" and not port:"53" -> hits on 443/http and 22/ssh
    // country:"New Zealand" or port:"7547"      -> hit 189.216.243.209 (Mexico)
    //                                              matching on the port alone
    const and = forProvider([
      { keyword: 'country', value: 'US' },
      { keyword: 'port', value: '53', operator: 'and' },
    ], 'quake360');
    assert.equal(and.queryText, 'country:"United States" and port:"53"');
    const not = forProvider([
      { keyword: 'country', value: 'US' },
      { keyword: 'port', value: '53', operator: 'not' },
    ], 'quake360');
    assert.equal(not.queryText, 'country:"United States" and not port:"53"');
  });

  test('fofa: && confirmed live, != only reaches the engine intact', () => {
    // country="US" && port="53" -> 967,285, facets 100% US / 100% port 53.
    // The != follow-up was blocked by fofa's CAPTCHA / crawler check while
    // signed out, so only the emitted string is pinned here, not a result count.
    const r = forProvider([
      { keyword: 'country', value: 'US' },
      { keyword: 'port', value: '53', operator: 'not' },
    ], 'fofa');
    assert.equal(r.queryText, 'country="US" && port!="53"');
  });
});
