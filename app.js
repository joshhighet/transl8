import { buildQueries, normalizeRows, toBase64Utf8 } from './querygen.js';

let queryDefs = [];
let providerDefs = [];
let countries = {};
let formRows = [];

const addBtn = document.getElementById('add-btn');
const clearBtn = document.getElementById('clear-btn');

// ── Bootstrap ──────────────────────────────────────────────────────────────

// The controls exist in the markup before the data arrives. Clicking one in
// that window used to render a keyword dropdown with no options in it, so they
// stay disabled until there is something to populate them with.
function setReady(ready) {
  for (const btn of [addBtn, clearBtn]) if (btn) btn.disabled = !ready;
}

async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  try {
    return await res.json();
  } catch {
    throw new Error(`${path} -> not valid JSON`);
  }
}

async function init() {
  setReady(false);
  try {
    [queryDefs, providerDefs, countries] = await Promise.all([
      loadJson('data/queries.json'),
      loadJson('data/providers.json'),
      loadJson('data/countries.json'),
    ]);
  } catch (err) {
    // Without this the page rendered a header, two dead buttons and nothing
    // else, with the only clue an uncaught rejection in the console.
    renderLoadError(err);
    return;
  }

  formRows = loadFromUrl() || [
    { keyword: 'ip',      value: '1.1.1.1' },
    { keyword: 'port',    value: '53',  operator: 'and' },
    { keyword: 'country', value: 'US',  operator: 'not' },
  ];

  setReady(true);
  renderForm();
  renderResults();
}

function renderLoadError(err) {
  const container = document.getElementById('results');
  if (!container) return;
  container.innerHTML = '';
  const box = el('div', { className: 'error-state', role: 'alert' });
  box.appendChild(el('p', { textContent: 'could not load the provider data, so no queries can be built.' }));
  box.appendChild(el('p', { innerHTML: `<code>${escapeHtml(String(err.message || err))}</code>` }));
  box.appendChild(el('p', {
    textContent: 'if you are running this locally, serve the folder over http '
      + '(python3 -m http.server 8000) rather than opening the file directly.',
  }));
  container.appendChild(box);
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ── URL state ───────────────────────────────────────────────────────────────

function loadFromUrl() {
  const raw = new URLSearchParams(location.search).get('queries');
  if (!raw) return null;
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return null; }
  // Drop anything malformed rather than throwing on a hand-edited URL.
  const rows = normalizeRows(parsed).filter(r => queryDefs.some(q => q.keyword === r.keyword));
  return rows.length ? rows : null;
}

function writeUrl() {
  const filtered = formRows.filter(r => (r.value || '').trim());
  const params = new URLSearchParams();
  if (filtered.length) params.set('queries', JSON.stringify(filtered));
  const qs = params.toString();
  history.replaceState(null, '', qs ? '?' + qs : location.pathname);
}

// Typing fired one replaceState per keystroke. Safari throttles history writes
// to ~100 per 30s and then throws, which a single long value (a sha256, say)
// can reach on its own. Coalesce them; the query preview still updates live.
let urlTimer = null;
function saveToUrl({ immediate = false } = {}) {
  if (urlTimer) clearTimeout(urlTimer);
  if (immediate) { urlTimer = null; writeUrl(); return; }
  urlTimer = setTimeout(() => { urlTimer = null; writeUrl(); }, 250);
}

// ── Render form ─────────────────────────────────────────────────────────────

function renderForm() {
  const container = document.getElementById('form-rows');
  container.innerHTML = '';

  // The first row has no operator dropdown, so it must not carry one in state
  // either -- otherwise deleting row 0 leaves an invisible operator behind.
  if (formRows.length) delete formRows[0].operator;

  formRows.forEach((row, i) => {
    const def = queryDefs.find(q => q.keyword === row.keyword);
    const div = document.createElement('div');
    div.className = 'query-row';

    // Operator (rows after the first)
    if (i > 0) {
      const sel = el('select', {
        className: 'op-select',
        'aria-label': `operator joining this term to the previous one (row ${i + 1})`,
      });
      for (const op of ['and', 'or', 'not']) {
        sel.appendChild(el('option', { value: op, textContent: op.toUpperCase(), selected: row.operator === op }));
      }
      sel.addEventListener('change', e => {
        formRows[i].operator = e.target.value;
        saveToUrl();
        renderResults();
      });
      div.appendChild(sel);
    } else {
      div.appendChild(el('div', { className: 'op-spacer' }));
    }

    // Keyword selector. The tooltip goes on a wrapping <span>: browsers do not
    // paint ::after on a <select>, so hanging it on the select itself meant the
    // field descriptions never appeared at all.
    const kwWrap = el('span', {
      className: 'kw-wrap' + (def?.description ? ' has-tip' : ''),
      'data-tip': def?.description || '',
    });
    const kwSel = el('select', {
      className: 'kw-select',
      // title gives screen readers and non-hover devices the same description
      // the visual tooltip carries.
      title: def?.description || '',
      'aria-label': def?.description ? `field (${def.description})` : 'field',
    });
    for (const qd of queryDefs) {
      kwSel.appendChild(el('option', { value: qd.keyword, textContent: qd.keyword, selected: row.keyword === qd.keyword }));
    }
    kwSel.addEventListener('change', e => {
      formRows[i].keyword = e.target.value;
      formRows[i].value = '';
      structuralUpdate();
    });
    kwWrap.appendChild(kwSel);
    div.appendChild(kwWrap);

    // Value — country gets a select, everything else gets a text input
    if (row.keyword === 'country') {
      const cSel = el('select', { className: 'country-select', 'aria-label': 'country' });
      cSel.appendChild(el('option', { value: '', textContent: 'select country', disabled: true, selected: !row.value }));
      for (const [code, name] of Object.entries(countries)) {
        cSel.appendChild(el('option', { value: code, textContent: `${name} (${code})`, selected: row.value === code }));
      }
      cSel.addEventListener('change', e => {
        formRows[i].value = e.target.value;
        saveToUrl();
        renderResults();
      });
      div.appendChild(cSel);
    } else {
      const input = el('input', {
        type: 'text',
        className: 'value-input',
        value: row.value,
        placeholder: def?.example || 'enter value',
        'aria-label': def?.description ? `${row.keyword} value (${def.description})` : `${row.keyword} value`,
      });
      input.addEventListener('input', e => {
        formRows[i].value = e.target.value;
        saveToUrl();
        renderResults();
      });
      // Don't leave a debounced write pending when focus moves away.
      input.addEventListener('blur', () => saveToUrl({ immediate: true }));
      div.appendChild(input);
    }

    // Delete button
    const del = el('button', {
      className: 'btn-icon has-tip',
      'data-tip': 'remove',
      type: 'button',
      'aria-label': `remove ${row.keyword} row`,
      innerHTML: iconTrash(),
    });
    del.addEventListener('click', () => {
      formRows.splice(i, 1);
      if (!formRows.length) formRows = [{ keyword: 'ip', value: '' }];
      structuralUpdate();
    });
    div.appendChild(del);

    container.appendChild(div);
  });
}

// ── Render results ──────────────────────────────────────────────────────────

function renderResults() {
  const container = document.getElementById('results');
  container.innerHTML = '';

  const results = buildQueries({ queryDefs, providerDefs, countries, formRows });
  if (!results.length) {
    container.innerHTML = '<p class="empty-state">add a query above to see results</p>';
    return;
  }

  for (const { provider, queryText, unavailable, reason } of results) {
    const card = el('div', { className: 'provider-card' + (unavailable ? ' unavailable' : '') });

    // Provider logo + name
    const info = el('div', { className: 'provider-info' });
    const logoLink = el('a', {
      href: provider.docs,
      target: '_blank',
      rel: 'noopener noreferrer',
      'aria-label': `${provider.name} query syntax documentation`,
    });
    logoLink.appendChild(el('img', {
      src: provider.png_uri, alt: '', width: 20, height: 20, loading: 'lazy',
    }));
    info.appendChild(logoLink);
    info.appendChild(el('span', { className: 'provider-name', textContent: provider.name }));
    card.appendChild(info);

    // Query output
    card.appendChild(el('div', {
      className: 'query-output ' + (unavailable ? 'err' : 'ok'),
      textContent: unavailable ? reason : queryText,
    }));

    // Copy + Open (only when available)
    if (!unavailable) {
      const actions = el('div', { className: 'card-actions' });

      const copyBtn = el('button', {
        className: 'btn-copy has-tip',
        'data-tip': 'copy',
        type: 'button',
        'aria-label': `copy the ${provider.name} query`,
        innerHTML: iconCopy(),
      });
      copyBtn.addEventListener('click', async () => {
        const ok = await copyText(queryText);
        // Previously this bailed out silently when the Clipboard API was
        // missing (it is absent on any non-https origin), so the button
        // looked broken. Always say what happened.
        copyBtn.classList.toggle('copied', ok);
        copyBtn.dataset.tip = ok ? 'copied!' : 'copy failed';
        setTimeout(() => {
          copyBtn.classList.remove('copied');
          copyBtn.dataset.tip = 'copy';
        }, 2000);
      });

      const openBtn = el('button', {
        className: 'btn-open',
        type: 'button',
        textContent: 'open',
        'aria-label': `open this query on ${provider.name}`,
      });
      openBtn.addEventListener('click', () => {
        const encoded = provider.name === 'fofa' ? toBase64Utf8(queryText) : encodeURIComponent(queryText);
        // 'noopener' is not implied for window.open the way it is for
        // <a target="_blank">, so without it the provider page keeps a
        // window.opener handle back to this one.
        window.open(provider.prefix + encoded, '_blank', 'noopener');
      });

      actions.appendChild(copyBtn);
      actions.appendChild(openBtn);
      card.appendChild(actions);
    }

    container.appendChild(card);
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

// navigator.clipboard only exists in a secure context, so fall back to the
// old execCommand path rather than doing nothing on plain http.
async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to the legacy path */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function structuralUpdate() {
  saveToUrl({ immediate: true });
  renderForm();
  renderResults();
}

function el(tag, props = {}) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'textContent') node.textContent = v;
    else if (k === 'innerHTML') node.innerHTML = v;
    else if (k === 'value' && tag === 'input') node.value = v;
    else if (k === 'selected' || k === 'disabled') { if (v) node[k] = true; }
    else node.setAttribute(k === 'className' ? 'class' : k, v);
  }
  return node;
}

function iconTrash() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/><path d="M9 6V4h6v2"/>
  </svg>`;
}

function iconCopy() {
  return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>`;
}

// ── Controls ─────────────────────────────────────────────────────────────────

addBtn?.addEventListener('click', () => {
  if (addBtn.disabled) return;
  formRows.push({ keyword: 'ip', value: '', operator: 'and' });
  structuralUpdate();
});

clearBtn?.addEventListener('click', () => {
  if (clearBtn.disabled) return;
  formRows = [{ keyword: 'ip', value: '' }];
  structuralUpdate();
});

init();
