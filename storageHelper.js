const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const xml2js = require('xml2js');
const axios = require('axios');
const jsforce = require('jsforce');
const { execSync } = require('child_process');


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

// ---------- Metadata Enhancements Below ----------

function getMetadataPath(sourceAlias, type) {
    return path.join(BASE_DIR, sourceAlias, type, '_metadata.json');
}

function saveComponentWithMetadata(sourceAlias, type, name, data) {
    const folder = path.join(BASE_DIR, sourceAlias, type);
    fs.mkdirSync(folder, { recursive: true });

    const filePath = path.join(folder, `${name}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

    const hash = crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
    const metadataPath = getMetadataPath(sourceAlias, type);

    let metadata = {};
    if (fs.existsSync(metadataPath)) {
        metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    }

    const now = new Date().toISOString();

    if (!metadata[name]) {
        metadata[name] = {
            created: now,
            modified: now,
            hash
        };
    } else {
        if (metadata[name].hash !== hash) {
            metadata[name].modified = now;
        }
        metadata[name].hash = hash;
    }

    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
}



function getComponentStatus(filePath, currentHash) {
    if (!fs.existsSync(filePath)) {
        const now = new Date().toISOString();
        return { status: 'new', created: now, modified: now };
    }

    try {
        const data = fs.readFileSync(filePath, 'utf-8');
        const hash = crypto.createHash('sha256').update(data).digest('hex');
        const stats = fs.statSync(filePath);

        const created = stats.birthtime.toISOString();
        const modified = stats.mtime.toISOString();

        return {
            status: hash === currentHash ? 'unchanged' : 'modified',
            created,
            modified
        };
    } catch (err) {
        console.error(`Failed to hash or stat ${filePath}:`, err.message);
        const now = new Date().toISOString();
        return { status: 'new', created: now, modified: now };
    }
}



// function getComponentStatus(filePath, currentHash) {
//     if (!fs.existsSync(filePath)) return { status: 'new', created: new Date(), modified: new Date() };

//     try {
//         const data = fs.readFileSync(filePath, 'utf-8');
//         if (!data) throw new Error('File is empty');
//         const hash = crypto.createHash('sha256').update(data).digest('hex');
//         const stats = fs.statSync(filePath);

//         return {
//             status: hash === currentHash ? 'unchanged' : 'modified',
//             created: stats.birthtime,
//             modified: stats.mtime
//         };
//     } catch (err) {
//         console.error(`Failed to read or hash ${filePath}:`, err.message);
//         return {
//             status: 'new',
//             created: new Date(),
//             modified: new Date()
//         };
//     }
// }




async function fetchMetadataDatesFromSalesforce(instanceUrl, accessToken, metaType, names) {
    const timestamps = {};
    
    // Use correct field for WHERE clause and selection
    const fieldName = metaType === 'LightningComponentBundle' ? 'DeveloperName' : 'Name';

    const query = `SELECT ${fieldName}, CreatedDate, LastModifiedDate FROM ${metaType} WHERE ${fieldName} IN ('${names.join("','")}')`;
    const url = `${instanceUrl}/services/data/v59.0/tooling/query/?q=${encodeURIComponent(query)}`;

    try {
        const response = await axios.get(url, {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });

        if (response.data && response.data.records) {
            response.data.records.forEach(record => {
                const nameKey = metaType === 'LightningComponentBundle' ? record.DeveloperName : record.Name;
                timestamps[nameKey] = {
                    createdDate: record.CreatedDate,
                    lastModifiedDate: record.LastModifiedDate
                };
            });
        }
    } catch (error) {
        console.error(`Failed to fetch ${metaType} dates:`, error.response?.data || error.message);
        throw new Error(`Failed to fetch ${metaType} dates`);
    }

    return timestamps;
}

function resolveOmniObjectName(type) {
    switch (type) {
        case 'FlexCard':
            return {
                objectName: 'OmniUiCard',
                nameField: 'Name'
            };
        case 'DataRaptor':
            return {
                objectName: 'OmniDataTransform',
                nameField: 'Name'
            };
        // Skip OmniScript and IntegrationProcedure because they are handled in fetchOmniComponentDates
        default:
            return null;
    }
}

// function normalize(name) {
//     return name ? name.replace(/[_\s]/g, '').toLowerCase() : '';
// }

// async function fetchOmniComponentDates(instanceUrl, accessToken, type, names) {
//     const timestamps = {};
//     const isOmniScriptOrIP = (type === 'OmniScript' || type === 'IntegrationProcedure');

//     if (isOmniScriptOrIP) {
//         const BATCH_SIZE = 100;
//         for (let i = 0; i < names.length; i += BATCH_SIZE) {
//             const batch = names.slice(i, i + BATCH_SIZE);

//             // Narrow the query to fetch only relevant OmniProcessType
//             const omniProcessTypeFilter = type === 'IntegrationProcedure' ? 'Integration Procedure' : 'OmniScript';
//             const query = `
//                 SELECT Name, OmniProcessKey, OmniProcessType, CreatedDate, LastModifiedDate 
//                 FROM OmniProcess 
//                 WHERE OmniProcessType = '${omniProcessTypeFilter}'
//             `;
//             const url = `${instanceUrl}/services/data/v59.0/query?q=${encodeURIComponent(query)}`;

//             try {
//                 const response = await axios.get(url, {
//                     headers: { Authorization: `Bearer ${accessToken}` }
//                 });

//                 if (response.data?.records) {
//                     response.data.records.forEach(record => {
//                         const key = record.OmniProcessKey || '';
//                         const name = record.Name || '';
//                         const normalizedKey = normalize(key);
//                         const normalizedName = normalize(name);

//                         if (type === 'IntegrationProcedure') {
//                             // IP is matched strictly using the exact key (no normalization needed)
//                             if (batch.includes(key)) {
//                                 timestamps[key] = {
//                                     createdDate: record.CreatedDate,
//                                     lastModifiedDate: record.LastModifiedDate
//                                 };
//                             }
//                         }

//                         if (type === 'OmniScript') {
//                             // OmniScript matched via normalization
//                             const matchedName = batch.find(original =>
//                                 normalize(original) === normalizedKey ||
//                                 normalize(original) === normalizedName
//                             );

//                             if (matchedName) {
//                                 timestamps[matchedName] = {
//                                     createdDate: record.CreatedDate,
//                                     lastModifiedDate: record.LastModifiedDate
//                                 };
//                             }
//                         }
//                     });
//                 }
//             } catch (err) {
//                 console.error(`❌ Error fetching from OmniProcess:`, err.response?.data || err.message);
//             }
//         }

//         return timestamps;
//     }

//     // For non-OmniScript/IP types (FlexCard, DataRaptor)
//     const resolved = resolveOmniObjectName(type);
//     if (!resolved) return {};
//     const { objectName, nameField } = resolved;

//     const BATCH_SIZE = 100;
//     for (let i = 0; i < names.length; i += BATCH_SIZE) {
//         const batch = names.slice(i, i + BATCH_SIZE);
//         const quotedNames = batch.map(n => `'${n}'`).join(',');
//         const query = `SELECT ${nameField}, CreatedDate, LastModifiedDate FROM ${objectName} WHERE ${nameField} IN (${quotedNames})`;
//         const url = `${instanceUrl}/services/data/v59.0/query?q=${encodeURIComponent(query)}`;

//         try {
//             const response = await axios.get(url, {
//                 headers: { Authorization: `Bearer ${accessToken}` }
//             });

//             if (response.data?.records) {
//                 response.data.records.forEach(record => {
//                     const key = record[nameField];
//                     timestamps[key] = {
//                         createdDate: record.CreatedDate,
//                         lastModifiedDate: record.LastModifiedDate
//                     };
//                 });
//             }
//         } catch (err) {
//             console.error(`❌ Failed fetching ${type} dates:`, err.response?.data || err.message);
//         }
//     }

//     return timestamps;
// }



function normalize(name) {
    return name ? name.replace(/[_\s]/g, '').toLowerCase() : '';
}

async function fetchOmniComponentDates(instanceUrl, accessToken, type, names, omniScriptKeyMap = {}) {
    const timestamps = {};
    const isOmniScriptOrIP = (type === 'OmniScript' || type === 'IntegrationProcedure');

    if (isOmniScriptOrIP) {
        const BATCH_SIZE = 100;
        for (let i = 0; i < names.length; i += BATCH_SIZE) {
            const batch = names.slice(i, i + BATCH_SIZE);
            console.log(`Fetching ${type} timestamps for batch:`, batch);

            const query = `SELECT Name, OmniProcessKey, OmniProcessType, CreatedDate, LastModifiedDate FROM OmniProcess`;
            const url = `${instanceUrl}/services/data/v59.0/query?q=${encodeURIComponent(query)}`;

            try {
                const response = await axios.get(url, {
                    headers: { Authorization: `Bearer ${accessToken}` }
                });

                const records = response.data?.records || [];
                console.log(`${records.length} records fetched from OmniProcess`);

                records.forEach(record => {
                    const key = record.OmniProcessKey;
                    const sfName = record.Name;
                    const matchType = record.OmniProcessType === 'Integration Procedure' ? 'IntegrationProcedure' : 'OmniScript';

                    if (matchType !== type) return;

                    if (type === 'IntegrationProcedure') {
                        if (batch.includes(key)) {
                            console.log(`IP matched: ${key}`);
                            timestamps[key] = {
                                // createdDate: record.CreatedDate,
                                // lastModifiedDate: record.LastModifiedDate
                                createdDate: formatDate(record.CreatedDate),
                                lastModifiedDate: formatDate(record.LastModifiedDate)
                            };
                        }
                    }

                    if (type === 'OmniScript') {
                        // match against omniScriptKeyMap (key = Type_SubType_Lang → OmniProcessKey)
                        const matchedCliFolder = Object.keys(omniScriptKeyMap).find(cliFolderKey =>
                            omniScriptKeyMap[cliFolderKey] === key || omniScriptKeyMap[cliFolderKey] === sfName
                        );

                        if (matchedCliFolder && batch.includes(matchedCliFolder)) {
                            console.log(`OmniScript matched: CLI folder='${matchedCliFolder}' SF Name='${sfName}'`);
                            timestamps[matchedCliFolder] = {
                                // createdDate: record.CreatedDate,
                                // lastModifiedDate: record.LastModifiedDate
                                createdDate: formatDate(record.CreatedDate),
                                lastModifiedDate: formatDate(record.LastModifiedDate)
                            };
                        }
                    }
                });
            } catch (err) {
                console.error(`Error fetching from OmniProcess:`, err.response?.data || err.message);
            }
        }
        return timestamps;
    }

    //  FlexCard, DR, etc.
    const resolved = resolveOmniObjectName(type);
    if (!resolved) return {};
    const { objectName, nameField } = resolved;

    const BATCH_SIZE = 100;
    for (let i = 0; i < names.length; i += BATCH_SIZE) {
        const batch = names.slice(i, i + BATCH_SIZE);
        const quotedNames = batch.map(n => `'${n}'`).join(',');
        const query = `SELECT ${nameField}, CreatedDate, LastModifiedDate FROM ${objectName} WHERE ${nameField} IN (${quotedNames})`;
        const url = `${instanceUrl}/services/data/v59.0/query?q=${encodeURIComponent(query)}`;

        try {
            const response = await axios.get(url, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });

            const records = response.data?.records || [];
            console.log(`${records.length} ${type} records fetched from ${objectName}`);

            records.forEach(record => {
                const key = record[nameField];
                timestamps[key] = {
                    createdDate: record.CreatedDate,
                    lastModifiedDate: record.LastModifiedDate
                };
            });
        } catch (err) {
            console.error(`Failed fetching ${type} dates:`, err.response?.data || err.message);
        }
    }

    return timestamps;
}

function formatDate(dateStr) {
    try {
        const options = {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        };
        const date = new Date(dateStr);
        return date.toLocaleString('en-US', options);
    } catch (e) {
        return dateStr;
    }
}


// ---------- Export ----------
module.exports = {
    saveComponent,
    saveIndex,
    getIndex,
    saveComponentWithMetadata,
    getComponentStatus,
    fetchMetadataDatesFromSalesforce,
    formatDate,
    fetchOmniComponentDates
    //  getOmniStudioComponentDates,
    //  resolveOmniSObjectName,
    // fetchOmniComponentDates
};


