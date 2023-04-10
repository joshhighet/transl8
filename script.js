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
    fofa: 'https://tempquery.com?query='
};

function populateKeywords(data, select) {
    for (const keyword of data) {
        const option = document.createElement('option');
        option.value = keyword.keyword;
        option.textContent = keyword.keyword;
        option.title = keyword.meta_desc;
        select.appendChild(option);
    }
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
    const queryInputs = document.getElementById('query-inputs');
    queryInputs.appendChild(keywordDiv);
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
            for (let i = 0; i < keywords.length; i++) {
                const keyword = keywords[i];
                const value = values[i];
                const matchingData = data.find(item => item.keyword === keyword);
                if (matchingData[platform] && value) {
                    queryText += `${matchingData[platform]}:${value} `;
                }
            }
            if (queryText) {
                const queryP = document.createElement('p');
                queryP.textContent = queryText.trim();
                queryDiv.appendChild(queryP);
                const copyButton = document.createElement('button');
                copyButton.classList.add('copy-button');
                copyButton.innerHTML = '<i class="fas fa-copy"></i>';
                copyButton.title = 'copy to clipboard';
                copyButton.addEventListener('click', () => {
                    navigator.clipboard.writeText(queryP.textContent);
                });
                queryDiv.appendChild(copyButton);
                const openButton = document.createElement('button');
                openButton.classList.add('open-button');
                openButton.textContent = 'open in search engine';
                openButton.addEventListener('click', () => {
                    if (urlPrefixes[platform]) {
                        window.open(`${urlPrefixes[platform]}${encodeURIComponent(queryP.textContent)}`, '_blank');
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
