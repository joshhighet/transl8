document.addEventListener('DOMContentLoaded', () => {
    fetch('queries.json')
        .then(response => response.json())
        .then(data => {
            setupForm(data);
        });
});

const urlPrefixes = {
    shodan: 'https://www.shodan.io/search?query=',
    censys: 'https://search.censys.io/search?resource=hosts&sort=RELEVANCE&per_page=25&virtual_hosts=EXCLUDE&q=',
    binaryedge: 'https://app.binaryedge.io/services/query?page=1&query=',
    zoomeye: 'https://www.zoomeye.org/searchResult?q=',
    fofa: 'https://en.fofa.info/result?qbase64=',
    quake360: 'https://quake.360.net/quake/#/searchResult?selectIndex=quake_service&latest=true&searchVal=',
    netlas: 'https://app.netlas.io/responses/?page=1&indices=&q=',
    onyphe: 'https://www.onyphe.io/search?q='
};

function populateKeywords(data, select) {
    for (const keyword of data) {
        const option = document.createElement('option');
        option.value = keyword.keyword;
        option.textContent = keyword.keyword;
        select.appendChild(option);
        if (keyword.description) {
            option.setAttribute('data-meta-desc', keyword.description);
        }
        if (keyword.example) {
            option.setAttribute('data-example', keyword.example);
        }
    }
    select.addEventListener('change', (event) => {
        const selectedOption = event.target.selectedOptions[0];
        const metaDesc = selectedOption.getAttribute('data-meta-desc');
        const example = selectedOption.getAttribute('data-example');
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
        buildQueries(data);
    });
}

function setupForm(data) {
    addKeywordInput(data);
    const addButton = document.getElementById('add-query');
    addButton.addEventListener('click', () => addKeywordInput(data));
}

function addKeywordInput(data) {
    const keywordDiv = document.createElement('div');
    keywordDiv.classList.add('keyword-input');
    const select = document.createElement('select');
    select.classList.add('query-keyword');
    populateKeywords(data, select);
    select.addEventListener('change', () => buildQueries(data));
    const input = document.createElement('input');
    input.type = 'text';
    input.classList.add('query-value');
    const matchingData = data.find(item => item.keyword === select.value);
    const example = matchingData.example;
    input.placeholder = example ? example : 'enter value';
    select.options[select.selectedIndex].setAttribute('data-meta-desc', matchingData.description);
    select.options[select.selectedIndex].setAttribute('data-example', example);
    input.addEventListener('input', () => buildQueries(data));
    keywordDiv.appendChild(select);
    keywordDiv.appendChild(input);
    const removeButton = document.createElement('button');
    removeButton.classList.add('remove-button');
    removeButton.innerHTML = '<i class="fas fa-trash-alt"></i>';
    removeButton.addEventListener('click', () => {
        keywordDiv.remove();
        buildQueries(data);
        const keywords = Array.from(document.querySelectorAll('.query-keyword')).map(element => element.value);
        const values = Array.from(document.querySelectorAll('.query-value')).map(element => element.value);
        updateURLQueryParameters(keywords, values);
    });
    keywordDiv.appendChild(removeButton);
    const metaDescSpan = document.createElement('span');
    metaDescSpan.classList.add('meta-desc');
    metaDescSpan.style.fontStyle = 'italic';
    metaDescSpan.style.marginTop = '5px';
    metaDescSpan.textContent = matchingData.description;
    keywordDiv.appendChild(metaDescSpan);
    const queryInputs = document.getElementById('query-inputs');
    queryInputs.appendChild(keywordDiv);
    const event = new Event('change');
    select.dispatchEvent(event);
    buildQueries(data);
}

function createQueryDiv(platform, data, keywords, values) {
    const queryDiv = document.createElement('div');
    queryDiv.classList.add('query');
    queryDiv.innerHTML = `<h3>${platform}</h3>`;
    let queryText = '';
    let queryTextUI = '';
    let unavailable = false;
    let tooltipText = '';

    for (let i = 0; i < keywords.length; i++) {
        const keyword = keywords[i];
        const value = values[i];
        const matchingData = data.find(item => item.keyword === keyword);
        if (matchingData[platform] && value) {
            let queryTerm = `${matchingData[platform]}:${value}`;
            let queryTermUI = `${matchingData[platform]}:"${value}"`;
            queryTextUI += `${queryTermUI} `;
            queryText += `${queryTerm} `;
        }
        if (matchingData[platform] === undefined && value) {
            unavailable = true;
            tooltipText = `The keyword "${keyword}" is not available for ${platform}.`;
            break;
        }
    }
    console.log(`unavailable: ${unavailable}`);
    console.log(`tooltipText: ${tooltipText}`);
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
        queryP.textContent = queryTextUI.trim();
        queryDiv.appendChild(queryP);

        const copyButton = createCopyButton(queryTextUI.trim());
        queryDiv.appendChild(copyButton);

        const openButton = createOpenButton(platform, queryText);
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
    const openButton = document.createElement('button');
    openButton.classList.add('open-button');
    openButton.textContent = 'open in search engine';
    openButton.addEventListener('click', () => {
        if (urlPrefixes[platform]) {
            window.open(`${urlPrefixes[platform]}${encodeURIComponent(queryText)}`, '_blank');
        } else {
            alert('URL prefix not found for this platform.');
        }
    });
    return openButton;
}

function buildQueries(data) {
    const keywords = Array.from(document.querySelectorAll('.query-keyword')).map(element => element.value);
    const values = Array.from(document.querySelectorAll('.query-value')).map(element => element.value);
    const queryResults = document.getElementById('query-results');
    queryResults.innerHTML = '';
    for (const platform in data[0]) {
        if (platform !== 'example' && platform !== 'description' && platform !== 'keyword') {
            const queryDiv = createQueryDiv(platform, data, keywords, values);
            queryResults.appendChild(queryDiv);
        }
    }
}