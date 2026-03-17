let queryDefs = [];
let providerDefs = [];
let countries = {};
let formRows = [];


// ── Bootstrap ──────────────────────────────────────────────────────────────

async function init() {
  [queryDefs, providerDefs, countries] = await Promise.all([
    fetch('data/queries.json').then(r => r.json()),
    fetch('data/providers.json').then(r => r.json()),
    fetch('data/countries.json').then(r => r.json()),
  ]);

  formRows = loadFromUrl() || [
    { keyword: 'ip',      value: '1.1.1.1' },
    { keyword: 'port',    value: '53',  operator: 'and' },
    { keyword: 'country', value: 'US',  operator: 'not' },
  ];

  renderForm();
  renderResults();
}

// ── URL state ───────────────────────────────────────────────────────────────

function loadFromUrl() {
  const raw = new URLSearchParams(location.search).get('queries');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function saveToUrl() {
  const filtered = formRows.filter(r => r.value.trim());
  const params = new URLSearchParams();
  if (filtered.length) params.set('queries', JSON.stringify(filtered));
  const qs = params.toString();
  history.replaceState(null, '', qs ? '?' + qs : location.pathname);
}

// ── Render form ─────────────────────────────────────────────────────────────

function renderForm() {
  const container = document.getElementById('form-rows');
  container.innerHTML = '';

  formRows.forEach((row, i) => {
    const def = queryDefs.find(q => q.keyword === row.keyword);
    const div = document.createElement('div');
    div.className = 'query-row';

    // Operator (rows after the first)
    if (i > 0) {
      const sel = el('select', { className: 'op-select' });
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

    // Keyword selector
    const kwSel = el('select', {
      className: 'kw-select' + (def?.description ? ' has-tip' : ''),
      'data-tip': def?.description || '',
    });
    for (const qd of queryDefs) {
      kwSel.appendChild(el('option', { value: qd.keyword, textContent: qd.keyword, selected: row.keyword === qd.keyword }));
    }
    kwSel.addEventListener('change', e => {
      formRows[i].keyword = e.target.value;
      formRows[i].value = '';
      structuralUpdate();
    });
    div.appendChild(kwSel);

    // Value — country gets a select, everything else gets a text input
    if (row.keyword === 'country') {
      const cSel = el('select', { className: 'country-select' });
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
      });
      input.addEventListener('input', e => {
        formRows[i].value = e.target.value;
        saveToUrl();
        renderResults();
      });
      div.appendChild(input);
    }

    // Delete button
    const del = el('button', { className: 'btn-icon has-tip', 'data-tip': 'remove', innerHTML: iconTrash() });
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

  const results = buildQueries();
  if (!results.length) {
    container.innerHTML = '<p class="empty-state">add a query above to see results</p>';
    return;
  }

  for (const { provider, queryText, unavailable, reason } of results) {
    const card = el('div', { className: 'provider-card' + (unavailable ? ' unavailable' : '') });

    // Provider logo + name
    const info = el('div', { className: 'provider-info' });
    const logoLink = el('a', { href: provider.docs, target: '_blank', rel: 'noopener noreferrer' });
    logoLink.appendChild(el('img', { src: provider.png_uri, alt: provider.name, width: 20, height: 20 }));
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
        innerHTML: iconCopy(),
      });
      copyBtn.addEventListener('click', () => {
        if (!navigator.clipboard) return;
        navigator.clipboard.writeText(queryText).then(() => {
          copyBtn.classList.add('copied');
          copyBtn.dataset.tip = 'copied!';
          setTimeout(() => { copyBtn.classList.remove('copied'); copyBtn.dataset.tip = 'copy'; }, 2000);
        });
      });

      const openBtn = el('button', { className: 'btn-open', textContent: 'open' });
      openBtn.addEventListener('click', () => {
        const encoded = provider.name === 'fofa' ? btoa(queryText) : encodeURIComponent(queryText);
        window.open(provider.prefix + encoded, '_blank');
      });

      actions.appendChild(copyBtn);
      actions.appendChild(openBtn);
      card.appendChild(actions);
    }

    container.appendChild(card);
  }
}

// ── Build queries ───────────────────────────────────────────────────────────

function buildQueries() {
  return providerDefs.map(provider => {
    const unsupported = [];
    let valid = true;

    // Check operators used
    const usedOps = new Set(formRows.slice(1).map(r => r.operator).filter(Boolean));
    for (const op of usedOps) {
      if (provider[`operators/${op}`] === null) {
        unsupported.push(`operator ${op.toUpperCase()}`);
        valid = false;
      }
    }

    // Check keyword support and value constraints
    for (const { keyword, value } of formRows) {
      const def = queryDefs.find(q => q.keyword === keyword);
      if (!def || !def[provider.name]) {
        unsupported.push(keyword);
        valid = false;
      }
      if (value.trim()) {
        if (def?.constraint && !new RegExp(def.constraint).test(value)) {
          unsupported.push(`${keyword} (invalid: ${value})`);
          valid = false;
        }
        if (provider.name === 'quake360' && keyword === 'country' && !countries[value.toUpperCase()]) {
          unsupported.push(`${keyword} (unknown code: ${value})`);
          valid = false;
        }
      }
    }

    if (!valid) {
      return { provider, queryText: '', unavailable: true, reason: `unsupported: ${unsupported.join(', ')}` };
    }

    let queryText = '';
    formRows.forEach(({ keyword, value, operator }, i) => {
      if (!value.trim()) return;

      const def = queryDefs.find(q => q.keyword === keyword);
      let fv = value;

      if (keyword === 'asn' && provider.as_includeprefix === 'TRUE') fv = `AS${value}`;
      if (provider.name === 'quake360' && keyword === 'country') fv = countries[value.toUpperCase()];

      const isFreeform = def[provider.name] === 'freeform';
      let term = isFreeform
        ? `"${fv}"`
        : `${def[provider.name]}${provider.kv_separator}"${fv}"`;

      if (i > 0) {
        if (operator && operator !== 'not' && provider[`operators/${operator}`]) {
          queryText += ` ${provider[`operators/${operator}`]} `;
        } else {
          queryText += provider.query_separator || ' ';
        }
      }

      if (operator === 'not' && provider['operators/not']) {
        term = provider.name.includes('criminalip')
          ? provider['operators/not'] + term.replace(/"/g, '')
          : `${provider['operators/not']} ${term}`;
      }

      queryText += term;
    });

    return { provider, queryText: queryText.trim(), unavailable: false, reason: '' };
  }).filter(r => r.queryText || r.unavailable);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function structuralUpdate() {
  saveToUrl();
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

document.getElementById('add-btn').addEventListener('click', () => {
  formRows.push({ keyword: 'ip', value: '', operator: 'and' });
  structuralUpdate();
});

document.getElementById('clear-btn').addEventListener('click', () => {
  formRows = [{ keyword: 'ip', value: '' }];
  structuralUpdate();
});

init();
