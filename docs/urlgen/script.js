document.getElementById('category').addEventListener('change', generateUrls);
document.getElementById('inputValue').addEventListener('input', generateUrls);

async function generateUrls() {
    const category = document.querySelector('input[name="category"]:checked').value;
    const inputValue = document.getElementById('inputValue').value;
    if (!inputValue) {
        document.getElementById('urlButtons').innerHTML = '';
        return;
    }
    const data = await fetch('urlgen.json').then(response => response.json());
    const filteredData = data.filter(item => item.category === category);
    let urlButtonsDiv = document.getElementById('urlButtons');
    urlButtonsDiv.innerHTML = '';
    for(let item of filteredData) {
        let urlString = item['Search string'].replace('%s', inputValue);
        let link = document.createElement('a');
        link.innerText = item.provider;
        link.href = urlString;
        link.target = "_blank";
        link.className = 'button'; 
        urlButtonsDiv.appendChild(link);
    }
}

generateUrls();
