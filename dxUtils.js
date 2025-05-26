// dxUtils.js
const { execSync } = require('child_process');

function getSupportedObjects(alias) {
    try {
        const output = execSync(`sfdx force:schema:sobject:list -u ${alias} --json`, { encoding: 'utf-8' });
        const json = JSON.parse(output);
        if (json.status !== 0) throw new Error(json.message);
        return json.result || [];
    } catch (e) {
        console.error('Failed to fetch supported sObjects:', e.message);
        return [];
    }
}

module.exports = {
    getSupportedObjects
};
