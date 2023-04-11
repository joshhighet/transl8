document.addEventListener('DOMContentLoaded', () => {
    fetch('transl8.json')
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
    fofa: 'https://en.fofa.info/result?qbase64='
};

function populateKeywords(data, select) {
    for (const keyword of data) {
        const option = document.createElement('option');
        option.value = keyword.keyword;
        option.textContent = keyword.keyword;
        select.appendChild(option);
        if (keyword.meta_desc) {
            option.setAttribute('data-meta-desc', keyword.meta_desc);
        }
    }

    select.addEventListener('change', (event) => {
        const selectedOption = event.target.selectedOptions[0];
        const metaDesc = selectedOption.getAttribute('data-meta-desc');
        const queryInputDiv = event.target.parentNode;
        const metaDescSpan = queryInputDiv.querySelector('.meta-desc');
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
    input.placeholder = 'enter value';
    input.addEventListener('input', () => buildQueries(data));
    keywordDiv.appendChild(select);
    keywordDiv.appendChild(input);
    const metaDescSpan = document.createElement('span');
    metaDescSpan.classList.add('meta-desc');
    metaDescSpan.style.fontStyle = 'italic';
    metaDescSpan.style.marginTop = '5px';
    keywordDiv.appendChild(metaDescSpan);
    const queryInputs = document.getElementById('query-inputs');
    queryInputs.appendChild(keywordDiv);
    const event = new Event('change');
    select.dispatchEvent(event);
    buildQueries(data);
}

function buildQueries(data) {
    const keywords = Array.from(document.querySelectorAll('.query-keyword')).map(element => element.value);
    const values = Array.from(document.querySelectorAll('.query-value')).map(element => element.value);
    const queryResults = document.getElementById('query-results');
    queryResults.innerHTML = '';
    for (const platform in data[0]) {
        if (platform !== 'keyword' && platform !== 'meta_desc') {
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
                    if (platform === 'censys' && queryTextUI) {
                        queryTermUI = `and ${queryTermUI}`;
                        queryTerm = `and ${queryTerm}`;
                    }
                    if (platform === 'fofa') {
                        queryTermUI = `${matchingData[platform]}="${value}"`;
                        queryTerm = `${matchingData[platform]}="${value}"`;
                    }
                    if (queryText) {
                        queryTerm = ` ${queryTerm}`;
                    }
                    queryTextUI += `${queryTermUI} `;
                    queryText += `${queryTerm} `;
                }
                if (matchingData[platform] === "unavailable") {
                    unavailable = true;
                    tooltipText = `The keyword "${keyword}" is not available for ${platform}.`;
                    break;
                }
            }
            if (platform === 'fofa') {
                queryText = queryText.trim().replace(/ +/g, ' ');
                queryTextUI = queryTextUI.trim().replace(/ +/g, ' ');
                queryText = btoa(queryText);
            }
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
                const copyButton = document.createElement('button');
                copyButton.classList.add('copy-button');
                copyButton.innerHTML = '<i class="fas fa-copy"></i>';
                copyButton.title = 'copy to clipboard';
                copyButton.addEventListener('click', () => {
                    navigator.clipboard.writeText(queryTextUI.trim());
                });
                queryDiv.appendChild(copyButton);
                const openButton = document.createElement('button');
                openButton.classList.add('open-button');
                openButton.textContent = 'open in search engine';
                openButton.addEventListener('click', () => {
                    if (urlPrefixes[platform]) {
                        if (platform === 'fofa') {
                            window.open(`${urlPrefixes[platform]}${queryText}`, '_blank');
                        } else {
                            window.open(`${urlPrefixes[platform]}${encodeURIComponent(queryText)}`, '_blank');
                        }
                    } else {
                        alert('URL prefix not found for this platform.');
                    }
                });
                queryDiv.appendChild(openButton);
            }
            queryResults.appendChild(queryDiv);
        }
    }
}
