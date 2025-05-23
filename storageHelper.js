const fs = require('fs');
const path = require('path');

const BASE_DIR = path.join(__dirname, 'storage');

if (!fs.existsSync(BASE_DIR)) {
    fs.mkdirSync(BASE_DIR, { recursive: true });
}

function saveComponent(sourceAlias, type, name, data) {
    const folder = path.join(BASE_DIR, sourceAlias, type, name);
    fs.mkdirSync(folder, { recursive: true });
    const filePath = path.join(folder, `${name}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function saveIndex(sourceAlias, summary) {
    const indexPath = path.join(BASE_DIR, sourceAlias, 'components-index.json');
    fs.mkdirSync(path.dirname(indexPath), { recursive: true });
    fs.writeFileSync(indexPath, JSON.stringify(summary, null, 2));
}

function getIndex(sourceAlias) {
    const indexPath = path.join(BASE_DIR, sourceAlias, 'components-index.json');
    if (!fs.existsSync(indexPath)) return null;
    return JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
}

module.exports = {
    saveComponent,
    saveIndex,
    getIndex
};
