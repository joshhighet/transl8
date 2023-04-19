document.addEventListener('DOMContentLoaded', () => {
    Promise.all([
        fetch('queries.json').then(response => response.json()),
        fetch('providers.json').then(response => response.json())
    ]).then(([queriesqueriesjson, providersqueriesjson]) => {
        setupForm(queriesqueriesjson, providersqueriesjson);
    });
});

function populateKeywords(queriesjson, select) {
    for (const keyword of queriesjson) {
        const option = document.createElement('option');
        option.value = keyword.keyword;
        option.textContent = keyword.keyword;
        select.appendChild(option);
        if (keyword.description) {
            option.setAttribute('queriesjson-meta-desc', keyword.description);
        }
        if (keyword.example) {
            option.setAttribute('queriesjson-example', keyword.example);
        }
    }
    select.addEventListener('change', (event) => {
        const selectedOption = event.target.selectedOptions[0];
        const metaDesc = selectedOption.getAttribute('queriesjson-meta-desc');
        const example = selectedOption.getAttribute('queriesjson-example');
        const queryInputDiv = event.target.parentNode;
        const metaDescSpan = queryInputDiv.querySelector('.meta-desc');
        const input = queryInputDiv.querySelector('.query-value');
        if (metaDescSpan) {
            metaDescSpan.textContent = metaDesc;
        } else {
            const newMetaDescSpan = document.createElement('span');
            newMetaDescSpan.classList.add('meta-desc');
            newMetaDescSpan.style.fontStyle = 'italic';
            newMetaDescSpan.style.marginTop = '5px';
            newMetaDescSpan.textContent = metaDesc;
            queryInputDiv.appendChild(newMetaDescSpan);
        }
        if (example) {
            input.placeholder = example;
        } else {
            input.placeholder = 'enter value';
        }
        buildQueries(queriesjson);
    });
}

function setupForm(queriesjson, providers) {
    addKeywordInput(queriesjson);
    const addButton = document.getElementById('add-query');
    addButton.addEventListener('click', () => addKeywordInput(queriesjson));
}

function addKeywordInput(queriesjson) {
    const keywordDiv = document.createElement('div');
    keywordDiv.classList.add('keyword-input');
    const select = document.createElement('select');
    select.classList.add('query-keyword');
    populateKeywords(queriesjson, select);
    select.addEventListener('change', () => buildQueries(queriesjson));
    const input = document.createElement('input');
    input.type = 'text';
    input.classList.add('query-value');
    const matchingqueriesjson = queriesjson.find(item => item.keyword === select.value);
    const example = matchingqueriesjson.example;
    input.placeholder = example ? example : 'enter value';
    select.options[select.selectedIndex].setAttribute('queriesjson-meta-desc', matchingqueriesjson.description);
    select.options[select.selectedIndex].setAttribute('queriesjson-example', example);
    input.addEventListener('input', () => buildQueries(queriesjson));
    keywordDiv.appendChild(select);
    keywordDiv.appendChild(input);
    const removeButton = document.createElement('button');
    removeButton.classList.add('remove-button');
    removeButton.innerHTML = '<i class="fas fa-trash-alt"></i>';
    removeButton.addEventListener('click', () => {
        keywordDiv.remove();
        buildQueries(queriesjson);
        const keywords = Array.from(document.querySelectorAll('.query-keyword')).map(element => element.value);
        const values = Array.from(document.querySelectorAll('.query-value')).map(element => element.value);
        updateURLQueryParameters(keywords, values);
    });
    keywordDiv.appendChild(removeButton);
    const metaDescSpan = document.createElement('span');
    metaDescSpan.classList.add('meta-desc');
    metaDescSpan.style.fontStyle = 'italic';
    metaDescSpan.style.marginTop = '5px';
    metaDescSpan.textContent = matchingqueriesjson.description;
    keywordDiv.appendChild(metaDescSpan);
    const queryInputs = document.getElementById('query-inputs');
    queryInputs.appendChild(keywordDiv);
    const event = new Event('change');
    select.dispatchEvent(event);
    buildQueries(queriesjson);
}

let providers;

async function loadProviders() {
  const response = await fetch("providers.json");
  providers = await response.json();
}

loadProviders();

function createQueryDiv(platform, queriesjson, keywords, values, providers) {
    const provider = providers.find(provider => provider.name === platform);
    const providerDocsURI = provider.docs;
    const kv_separator = provider.kv_separator;
    const queryDiv = document.createElement('div');
    queryDiv.classList.add('query');
    const providerlogouri = provider.png_uri;
    queryDiv.innerHTML = `
      <div class="provider-header">
        <h3>${platform}</h3>
        <a href="${providerDocsURI}" target="_blank">
          <img class="provider-logo" src="${providerlogouri}" alt="${platform} logo" />
        </a>
      </div>`;
    let queryText = '';
    let unavailable = false;
    let tooltipText = '';
    for (let i = 0; i < keywords.length; i++) {
        const keyword = keywords[i];
        const matchingqueriesjson = queriesjson.find(item => item.keyword === keyword);
        asnPrefix = '';
        if (keyword === 'asn') {
            const setasn = provider.as_includeprefix;
            if (setasn === 'TRUE') {
                asnPrefix = 'AS';
            }
        }
        const value = asnPrefix + values[i];
        if (matchingqueriesjson[platform] && value) {
            let queryTermUI = `${matchingqueriesjson[platform]}${kv_separator}"${value}"`;            
            queryText += `${queryTermUI}`;
        }
        if (matchingqueriesjson[platform] == null) {
            unavailable = true;
            tooltipText = `The keyword "${keyword}" is not available for ${platform}.`;
            break;
        }
        if (i < keywords.length - 1) {
            if (provider['query_separator']) {
                queryText += provider['query_separator'];
            }
            else {
                queryText += ' ';
            }
        }
    }
    const queryImg = document.createElement('img');
    queryImg.classList.add('provider-logo');
    queryImg.src = providerlogouri;
    queryImg.alt = `${platform} logo`;
    queryImg.style.pointerEvents = "none";
    queryDiv.appendChild(queryImg);
    if (unavailable) {
        queryDiv.classList.add("unavailable");
        const tooltipP = document.createElement('p');
        tooltipP.innerHTML = `<i>${tooltipText}</i>`;
        queryDiv.appendChild(tooltipP);
    } else {
        queryDiv.classList.remove("unavailable");
    }
    if (queryText) {
        const queryP = document.createElement('p');
        queryP.textContent = queryText.trim();
        queryDiv.appendChild(queryP);
        const copyButton = createCopyButton(queryText.trim());
        queryDiv.appendChild(copyButton);
        const openButton = createOpenButton(platform, queryText.trim());
        queryDiv.appendChild(openButton);
    }
    return queryDiv;
}

function createCopyButton(text) {
    const copyButton = document.createElement('button');
    copyButton.classList.add('copy-button');
    copyButton.innerHTML = '<i class="fas fa-copy"></i>';
    copyButton.title = 'copy to clipboard';
    copyButton.addEventListener('click', () => {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
    });
    return copyButton;
}

function createOpenButton(platform, queryText) {
    const thisPrefix = providers.find(provider => provider.name === platform).prefix;
    const openButton = document.createElement('button');
    openButton.classList.add('open-button');
    openButton.textContent = 'open in search engine';
    openButton.addEventListener('click', () => {
    window.open(`${thisPrefix}${encodeURIComponent(queryText)}`, '_blank');

    });
    return openButton;
}

function buildQueries(queriesjson) {
    const keywords = Array.from(document.querySelectorAll('.query-keyword')).map(element => element.value);
    const values = Array.from(document.querySelectorAll('.query-value')).map(element => element.value);
    const queryRequest = document.getElementById('query-results');
    queryRequest.innerHTML = '';
    for (const platform in queriesjson[0]) {
        if (platform !== 'example' && platform !== 'description' && platform !== 'keyword' && platform !== 'constraint') {
            const queryDiv = createQueryDiv(platform, queriesjson, keywords, values, providers);
            queryRequest.appendChild(queryDiv);
        }
    }
}
