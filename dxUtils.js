// ✅ dxUtils.js
const { execSync } = require('child_process');
const util = require('util');
const path = require('path');

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

function getObjectFields(alias, objectName) {
    try {
        const result = execSync(`sfdx force:schema:sobject:describe -s ${objectName} -u ${alias} --json`, { encoding: 'utf-8' });
        const json = JSON.parse(result);
        if (json.status !== 0) throw new Error(json.message);
        return json.result.fields.map(f => f.name);
    } catch (err) {
        console.error(`Failed to describe object ${objectName}:`, err.message);
        return [];
    }
}

function timeAgo(dateString) {
    const now = new Date();
    const then = new Date(dateString);
    const diff = Math.floor((now - then) / 1000); // in seconds

    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

// function inferComponentDetails(files) {
//     return files.map(filePath => {
//         const ext = path.extname(filePath);
//         const baseName = path.basename(filePath, ext);
//         const parts = filePath.split(path.sep);

//         // Try to infer type from folders like classes/, triggers/, lwc/, omniscripts/
//         let typeGuess = 'Unknown';
//         if (filePath.includes('classes')) typeGuess = 'ApexClass';
//         else if (filePath.includes('triggers')) typeGuess = 'ApexTrigger';
//         else if (filePath.includes('lwc')) typeGuess = 'LWC';
//         else if (filePath.includes('OmniScript')) typeGuess = 'OmniScript';
//         else if (filePath.includes('FlexCard')) typeGuess = 'FlexCard';
//         else if (filePath.includes('DataRaptor')) typeGuess = 'DataRaptor';
//         else if (filePath.includes('IntegrationProcedure')) typeGuess = 'IntegrationProcedure';

//         return {
//             file: filePath,
//             type: typeGuess,
//             name: baseName
//         };
//     });
// }

function inferComponentDetails(files) {
    const components = [];

    for (const file of files) {
        const normalized = file.replace(/\\/g, '/'); // Normalize Windows paths
        let type = 'Unknown';
        let name = 'Unknown';

        // Skip non-component files
        if (
            normalized.endsWith('.gitlab-ci.yml') ||
            normalized.includes('/.meta/') ||
            normalized.endsWith('sfdx-project.json') ||
            normalized.endsWith('release.json') ||
            normalized.endsWith('.rollback-marker') ||
            normalized.endsWith('README.md')
        ) {
            continue;
        }

        // OmniStudio: OmniScript, DataRaptor, FlexCard
        let match;
        if ((match = normalized.match(/\/(OmniScript|DataRaptor|FlexCard)\/([^/]+)\//))) {
            type = match[1];
            name = match[2];
        }

        // ApexClass
        else if ((match = normalized.match(/\/classes\/([^/]+)\.cls$/))) {
            type = 'ApexClass';
            name = match[1];
        }

        // ApexTrigger
        else if ((match = normalized.match(/\/triggers\/([^/]+)\.trigger$/))) {
            type = 'ApexTrigger';
            name = match[1];
        }

        // LWC
        else if ((match = normalized.match(/\/lwc\/([^/]+)\//))) {
            type = 'LWC';
            name = match[1];
        }

        // Fallback: Use file name as component name (last segment before extension)
        else {
            const ext = path.extname(normalized);
            name = path.basename(normalized, ext);
        }

        components.push({ file, type, name });
    }

    return components;
}




module.exports = {
    getSupportedObjects,
    inferComponentDetails,
    timeAgo,
    getObjectFields
};


// const { execSync } = require('child_process');

// function getSupportedObjects(alias) {
//     try {
//         const output = execSync(`sfdx force:schema:sobject:list -u ${alias} --json`, { encoding: 'utf-8' });
//         const json = JSON.parse(output);
//         if (json.status !== 0) throw new Error(json.message);
//         return json.result || [];
//     } catch (e) {
//         console.error('Failed to fetch supported sObjects:', e.message);
//         return [];
//     }
// }

// function getObjectFields(alias, objectName) {
//     try {
//         const result = execSync(`sfdx force:schema:sobject:describe -s ${objectName} -u ${alias} --json`, { encoding: 'utf-8' });
//         const json = JSON.parse(result);
//         if (json.status !== 0) throw new Error(json.message);
//         return json.result.fields.map(f => f.name);
//     } catch (err) {
//         console.error(`Failed to describe object ${objectName}:`, err.message);
//         return [];
//     }
// }

// // NEW FUNCTION: Get only supported OmniStudio component types
// function getSupportedOmniTypes(alias) {
//     const allOmniTypes = [
//         'OmniScript',
//         'IntegrationProcedure',
//         'DataRaptor',
//         'FlexCard',
//         // 'OmniStudioAction',
//         // 'VlocityUITemplate',
//         // 'VlocityUILayout',
//         // 'CalculationMatrix',
//         // 'CalculationProcedure',
//         // 'OmniStudioTrackingService'
//     ];

//     const supportedObjects = getSupportedObjects(alias);
//     const supportedTypes = [];

//     allOmniTypes.forEach(type => {
//         const sobject1 = `vlocity_ins__${type}__c`;
//         const sobject2 = `omnistudio__${type}__c`;
//         if (
//             supportedObjects.includes(type) ||       // raw (unlikely)
//             supportedObjects.includes(sobject1) ||
//             supportedObjects.includes(sobject2)
//         ) {
//             supportedTypes.push(type);
//         }
//     });

//     return supportedTypes;
// }

// module.exports = {
//     getSupportedObjects,
//     getObjectFields,
//     getSupportedOmniTypes // export the new one too
// };
