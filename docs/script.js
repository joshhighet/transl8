let providers = [];
let queries = [];
let countries = {};
let debounceTimer;

async function fetchData(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch ${url}`);
    return await response.json();
  } catch (error) {
    console.error(`Error fetching ${url}:`, error);
    return null;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  [queries, providers, countries] = await Promise.all([
    fetchData('queries.json'),
    fetchData('providers.json'),
    fetchData('countries.json')
  ]);
  if (!providers || !queries) return console.error('Data loading failed');

  window.COUNTRIES = countries;
  setupForm(queries, providers);
  document.getElementById('add-query').addEventListener('click', () => addKeywordInput(queries));
  document.getElementById('share-link').addEventListener('click', () => {
    navigator.clipboard.writeText(window.location.href);
    alert('Share link copied!');
  });
});

function setupForm(queries, providers) {
  const params = new URLSearchParams(window.location.search);
  const keywords = params.getAll('keywords[]');
  const values = params.getAll('values[]');
  const operators = params.getAll('operators[]');
  if (keywords.length) {
    keywords.forEach((kw, i) => {
      addKeywordInput(queries, operators[i] || 'and');
      const div = document.querySelectorAll('.keyword-input')[i];
      div.querySelector('.query-keyword').value = kw;
      div.querySelector('.query-value').value = values[i] || '';
      div.querySelector('.query-keyword').dispatchEvent(new Event('change'));
    });
  } else {
    addKeywordInput(queries);
  }
  buildQueries(queries, providers);
}

function populateKeywords(queries, select) {
  queries.forEach(query => {
    const option = document.createElement('option');
    option.value = query.keyword;
    option.textContent = query.keyword;
    select.appendChild(option);
    if (query.description) option.dataset.desc = query.description;
    if (query.example) option.dataset.example = query.example;
    if (query.keyword === 'ip') option.selected = true;
  });
}

function addKeywordInput(queries, operator = 'and') {
  const keywordDiv = document.createElement('div');
  keywordDiv.classList.add('keyword-input', 'flex', 'items-center', 'space-x-2');

  // Operator select (after first input)
  const inputs = document.querySelectorAll('.keyword-input');
  if (inputs.length > 0) {
    const opSelect = document.createElement('select');
    opSelect.classList.add('query-operator', 'flex', 'h-10', 'w-full', 'rounded-md', 'border', 'border-input', 'bg-background', 'px-3', 'py-2', 'text-sm', 'ring-offset-background', 'focus-visible:outline-none', 'focus-visible:ring-2', 'focus-visible:ring-ring', 'focus-visible:ring-offset-2', 'disabled:cursor-not-allowed', 'disabled:opacity-50');
    ['and', 'or', 'not'].forEach(op => {
      const opt = document.createElement('option');
      opt.value = op;
      opt.textContent = op.toUpperCase();
      if (op === operator) opt.selected = true;
      opSelect.appendChild(opt);
    });
    opSelect.addEventListener('change', () => debounceBuild(queries, providers));
    keywordDiv.appendChild(opSelect);
  }

  const select = document.createElement('select');
  select.classList.add('query-keyword', 'flex', 'h-10', 'w-full', 'rounded-md', 'border', 'border-input', 'bg-background', 'px-3', 'py-2', 'text-sm', 'ring-offset-background', 'focus-visible:outline-none', 'focus-visible:ring-2', 'focus-visible:ring-ring', 'focus-visible:ring-offset-2', 'disabled:cursor-not-allowed', 'disabled:opacity-50');
  populateKeywords(queries, select);
  select.addEventListener('change', (e) => {
    const selected = e.target.selectedOptions[0];
    const input = keywordDiv.querySelector('.query-value');
    input.placeholder = selected.dataset.example || 'Enter value';
    updateMetaDesc(keywordDiv, selected.dataset.desc);
    debounceBuild(queries, providers);
  });

  const input = document.createElement('input');
  input.type = 'text';
  input.classList.add('query-value', 'flex', 'h-10', 'w-full', 'rounded-md', 'border', 'border-input', 'bg-background', 'px-3', 'py-2', 'text-sm', 'ring-offset-background', 'placeholder:text-muted-foreground', 'focus-visible:outline-none', 'focus-visible:ring-2', 'focus-visible:ring-ring', 'focus-visible:ring-offset-2', 'disabled:cursor-not-allowed', 'disabled:opacity-50');
  input.addEventListener('input', (e) => {
    validateInput(keywordDiv, queries.find(q => q.keyword === select.value), e.target.value);
    debounceBuild(queries, providers);
  });

  const removeBtn = document.createElement('button');
  removeBtn.classList.add('inline-flex', 'items-center', 'justify-center', 'whitespace-nowrap', 'rounded-md', 'text-sm', 'font-medium', 'ring-offset-background', 'transition-colors', 'focus-visible:outline-none', 'focus-visible:ring-2', 'focus-visible:ring-ring', 'focus-visible:ring-offset-2', 'disabled:pointer-events-none', 'disabled:opacity-50', 'bg-destructive', 'text-destructive-foreground', 'hover:bg-destructive/90', 'h-10', 'px-4', 'py-2');
  removeBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
  removeBtn.addEventListener('click', () => {
    keywordDiv.remove();
    debounceBuild(queries, providers);
  });

  keywordDiv.appendChild(select);
  keywordDiv.appendChild(input);
  keywordDiv.appendChild(removeBtn);

  const metaDiv = document.createElement('div');
  metaDiv.classList.add('tooltip', 'ml-2');
  const metaSpan = document.createElement('span');
  metaSpan.classList.add('tooltip-content');
  metaDiv.appendChild(metaSpan);
  keywordDiv.appendChild(metaDiv);

  document.getElementById('query-inputs').appendChild(keywordDiv);
  select.dispatchEvent(new Event('change'));
}

function updateMetaDesc(div, desc) {
  const tooltipContent = div.querySelector('.tooltip-content');
  tooltipContent.textContent = desc || '';
}

function validateInput(div, query, value) {
  const warning = div.querySelector('.warning');
  if (warning) warning.remove();
  if (query?.constraint && !new RegExp(query.constraint).test(value)) {
    const warnSpan = document.createElement('span');
    warnSpan.classList.add('warning', 'text-red-500', 'text-sm', 'mt-1');
    warnSpan.textContent = `Invalid value for ${query.keyword}. Check format.`;
    div.appendChild(warnSpan);
  }
}

function debounceBuild(queries, providers) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => buildQueries(queries, providers), 300);
}

function buildQueries(queries, providers) {
  const keywords = Array.from(document.querySelectorAll('.query-keyword')).map(el => el.value);
  const values = Array.from(document.querySelectorAll('.query-value')).map(el => el.value);
  const operators = Array.from(document.querySelectorAll('.query-operator')).map(el => el.value);
  const results = document.getElementById('query-results');
  results.innerHTML = '';
  providers.forEach(provider => {
    const queryDiv = createQueryDiv(provider.name, queries, keywords, values, operators, provider);
    results.appendChild(queryDiv);
  });
  updateURLState(keywords, values, operators);
}

function createQueryDiv(platform, queries, keywords, values, operators, provider) {
  const card = document.createElement('div');
  card.classList.add('rounded-xl', 'border', 'bg-card', 'text-card-foreground', 'shadow', 'p-4', 'relative');

  const header = document.createElement('h3');
  header.classList.add('text-lg', 'font-semibold', 'mb-2');
  header.textContent = platform;
  card.appendChild(header);

  let queryText = '';
  let unavailable = false;
  let tooltipText = '';
  for (let i = 0; i < keywords.length; i++) {
    const kw = keywords[i];
    const queryItem = queries.find(q => q.keyword === kw);
    let val = values[i];
    if (kw === 'asn' && provider.as_includeprefix === 'TRUE') val = 'AS' + val;
    if (platform === 'quake360' && kw === 'country') {
      val = COUNTRIES[val] || val;
      if (!COUNTRIES[val]) {
        unavailable = true;
        tooltipText = `The country code "${val}" could not be found.`;
        break;
      }
    }
    if (queryItem[platform] === 'freeform') {
      queryText += `"${val}" `;
      continue;
    }
    if (!queryItem[platform]) {
      unavailable = true;
      tooltipText = `The keyword "${kw}" is not available for ${platform}.`;
      break;
    }
    let op = '';
    if (i > 0) {
      const prevOp = operators[i - 1];
      op = provider[`operators/${prevOp}`] || prevOp.toUpperCase();
      queryText += (provider.query_separator || ' ') + op + ' ';
    }
    const term = `${queryItem[platform]}${provider.kv_separator}"${val}"`;
    queryText += term;
  }

  const logoImg = document.createElement('img');
  logoImg.src = provider.png_uri;
  logoImg.alt = `${platform} logo`;
  logoImg.classList.add('absolute', 'top-2', 'right-2', 'w-10', 'h-10');
  const logoLink = document.createElement('a');
  logoLink.href = provider.docs;
  logoLink.target = '_blank';
  logoLink.appendChild(logoImg);
  card.appendChild(logoLink);

  if (unavailable) {
    card.classList.add('opacity-50');
    const tooltipP = document.createElement('p');
    tooltipP.classList.add('text-sm', 'italic', 'text-muted-foreground');
    tooltipP.textContent = tooltipText;
    card.appendChild(tooltipP);
  } else {
    const queryP = document.createElement('p');
    queryP.classList.add('font-mono', 'text-xs', 'bg-black', 'text-cyan-400', 'p-2', 'rounded', 'overflow-x-auto', 'mb-2');
    queryP.textContent = queryText.trim();
    card.appendChild(queryP);

    const copyBtn = document.createElement('button');
    copyBtn.classList.add('inline-flex', 'items-center', 'justify-center', 'whitespace-nowrap', 'rounded-md', 'text-sm', 'font-medium', 'ring-offset-background', 'transition-colors', 'focus-visible:outline-none', 'focus-visible:ring-2', 'focus-visible:ring-ring', 'focus-visible:ring-offset-2', 'disabled:pointer-events-none', 'disabled:opacity-50', 'bg-secondary', 'text-secondary-foreground', 'hover:bg-secondary/80', 'h-10', 'px-4', 'py-2', 'mr-2');
    copyBtn.innerHTML = '<i class="fas fa-copy mr-2"></i> Copy';
    copyBtn.addEventListener('click', () => navigator.clipboard.writeText(queryText.trim()));

    const openBtn = document.createElement('button');
    openBtn.classList.add('inline-flex', 'items-center', 'justify-center', 'whitespace-nowrap', 'rounded-md', 'text-sm', 'font-medium', 'ring-offset-background', 'transition-colors', 'focus-visible:outline-none', 'focus-visible:ring-2', 'focus-visible:ring-ring', 'focus-visible:ring-offset-2', 'disabled:pointer-events-none', 'disabled:opacity-50', 'bg-primary', 'text-primary-foreground', 'hover:bg-primary/90', 'h-10', 'px-4', 'py-2');
    openBtn.textContent = 'Open in Engine';
    openBtn.addEventListener('click', () => {
      let finalQuery = platform === 'fofa' ? btoa(queryText.trim()) : encodeURIComponent(queryText.trim());
      window.open(`${provider.prefix}${finalQuery}`, '_blank');
    });

    const btnGroup = document.createElement('div');
    btnGroup.classList.add('flex', 'justify-between');
    btnGroup.appendChild(copyBtn);
    btnGroup.appendChild(openBtn);
    card.appendChild(btnGroup);
  }

  return card;
}

function updateURLState(keywords, values, operators) {
  const params = new URLSearchParams();
  keywords.forEach((kw, i) => {
    params.append('keywords[]', kw);
    params.append('values[]', values[i]);
    params.append('operators[]', operators[i] || 'and');
  });
  history.replaceState(null, '', `?${params.toString()}`);
}