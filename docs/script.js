let providers = [];

async function fetchData(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`failed to fetch ${url}: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`failed fetching data from ${url}:`, error);
        return null;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const [queries, providerData, countriesData] = await Promise.all([
            fetchData('queries.json'),
            fetchData('providers.json'),
            fetchData('countries.json')
        ]);
        if (!providerData) {
            console.error("providers.json could not be loaded");
            return;
        }
        window.COUNTRIES = countriesData;
        //console.log("setting providers value:", providerData);
        providers = providerData;
        setupForm(queries, providers);
    } catch (error) {
        console.error("failed initializing app:", error);
    }
});

function populateKeywords(queries, select) {
    for (const keyword of queries) {
        const option = document.createElement('option');
        option.value = keyword.keyword;
        option.textContent = keyword.keyword;
        select.appendChild(option);
        if (keyword.description) {
            option.setAttribute('data-desc', keyword.description);
        }
        if (keyword.example) {
            option.setAttribute('data-example', keyword.example);
        }
        if (keyword.keyword === 'ip') {
            option.selected = true;
        }
    }
    select.addEventListener('change', (event) => {
        const selectedOption = event.target.selectedOptions[0];
        const metaDesc = selectedOption.getAttribute('data-desc');
        const example = selectedOption.getAttribute('data-example');
        const queryInputDiv = event.target.parentNode;
        const metaDescSpan = queryInputDiv.querySelector('.meta-desc');
        const input = queryInputDiv.querySelector('.query-value');
        input.addEventListener('input', (e) => {
            const queryItem = queries.find(item => item.keyword === select.value);
            const constraint = queryItem ? queryItem.constraint : null;
            if (constraint) {
                const regex = new RegExp(constraint);
                const isValid = regex.test(e.target.value);
                if (!isValid) {
                    const oldWarning = queryInputDiv.querySelector('.warning');
                    if (oldWarning) {
                        oldWarning.remove();
                    }
                    const warning = document.createElement('span');
                    warning.classList.add('warning');
                    warning.textContent = `Regex field check failed! Ensure you have the right value for ${select.value}.`;
                    queryInputDiv.appendChild(warning);
                } else {
                    const warning = queryInputDiv.querySelector('.warning');
                    if (warning) {
                        warning.remove();
                    }
                }
            }
        });
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
            input.placeholder = 'Enter value';
        }
        buildQueries(queries);
    });
}

function setupForm(queries, providers) {
    addKeywordInput(queries);
    const addButton = document.getElementById('add-query');
    addButton.addEventListener('click', () => addKeywordInput(queries));
}

function addKeywordInput(queries) {
    const keywordDiv = document.createElement('div');
    keywordDiv.classList.add('keyword-input');
    const select = document.createElement('select');
    select.classList.add('query-keyword');
    populateKeywords(queries, select);
    select.addEventListener('change', () => buildQueries(queries));
    const input = document.createElement('input');
    input.type = 'text';
    input.classList.add('query-value');
    const matchingQuery = queries.find(item => item.keyword === select.value);
    const example = matchingQuery.example;
    input.placeholder = example ? example : 'enter value';
    select.options[select.selectedIndex].setAttribute('data-desc', matchingQuery.description);
    select.options[select.selectedIndex].setAttribute('data-example', example);
    input.addEventListener('input', () => buildQueries(queries));
    keywordDiv.appendChild(select);
    keywordDiv.appendChild(input);
    const removeButton = document.createElement('button');
    removeButton.classList.add('remove-button');
    removeButton.innerHTML = '<i class="fas fa-trash-alt"></i>';
    removeButton.addEventListener('click', () => {
        keywordDiv.remove();
        buildQueries(queries);
    });
    keywordDiv.appendChild(removeButton);
    const metaDescSpan = document.createElement('span');
    metaDescSpan.classList.add('meta-desc');
    metaDescSpan.style.fontStyle = 'italic';
    metaDescSpan.style.marginTop = '5px';
    metaDescSpan.textContent = matchingQuery.description;
    keywordDiv.appendChild(metaDescSpan);
    const queryInputs = document.getElementById('query-inputs');
    queryInputs.appendChild(keywordDiv);
    const event = new Event('change');
    select.dispatchEvent(event);
    buildQueries(queries);
}

function createQueryDiv(platform, queriesjson, keywords, values, providers) {
    //console.log("entering createQueryDiv with providers:", providers);
    if (!providers || providers.length === 0) {
        console.error("providers data not yet loaded");
        return;
    }    
    const provider = providers.find(provider => provider.name === platform);
    const providerDocsURI = provider.docs;
    const kv_separator = provider.kv_separator;
    const queryDiv = document.createElement('div');
    queryDiv.classList.add('query');
    const providerlogouri = provider.png_uri;
    queryDiv.innerHTML = `
      <div class="provider-header">
        <h3>${platform}</h3>
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
        let value = asnPrefix + values[i];
        if (platform === 'quake360' && keyword === 'country') {
            if (countries[value]) {
                value = countries[value];
            }
            else {
                unavailable = true;
                tooltipText = `the country code "${value}" can not be found.`;
                break;
            }
        }
        if (matchingqueriesjson[platform] === 'freeform') {
            queryText += `"${value}" `;
            continue;
        }
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
    const imageAnchor = document.createElement('a');
    imageAnchor.href = providerDocsURI;
    imageAnchor.target = "_blank";
    imageAnchor.appendChild(queryImg);
    queryDiv.appendChild(imageAnchor);
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
        let finalQuery = (platform === 'fofa') ? btoa(queryText) : encodeURIComponent(queryText);
        window.open(`${thisPrefix}${finalQuery}`, '_blank');
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
