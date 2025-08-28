require('dotenv').config();

const tmp = require('tmp'); 
const express = require('express');
const { exec, execSync } = require('child_process');
const util = require('util');
const execPromise = util.promisify(require('child_process').exec);
const { authenticateWithJWT } = require('./authHelper');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const storage = require('./storageHelper');
const axios = require('axios');
const stripAnsi = require('strip-ansi');
const jobStore = {};
const xmlBuilder = require('xmlbuilder');
const crypto = require('crypto');
const gitExportDir = './git-export';
const AdmZip = require('adm-zip');
const {
    saveComponentWithMetadata,
    fetchOmniComponentDates,
    mergeSelectedComponents,
    formatDate,
    // fetchAndStoreComponentsFromOrg,
    diffComponents,
    getComponentStatus
} = require('./storageHelper');
const {
    timeAgo,
    inferComponentDetails,
    getLatestPipelineInfo
} = require('./dxUtils');
const STORAGE_DIR = path.join(__dirname, 'storage');
const repoUrl = process.env.GITLAB_REPO_URL;
const simpleGit = require('simple-git');
const fsExtra = require('fs-extra');
const app = express();
app.use(express.json());




const allTypes = [
    'OmniScript',
    'DataRaptor',
    'IntegrationProcedure',
    'FlexCard',
    'VlocityCard__CardState__c',
    'VlocityUILayout',
    'VlocityUITemplate',
];


/**working /comp for regular latest code */
// app.get('/components', async (req, res) => {
//     const { sourceAlias } = req.query;
//     if (!sourceAlias) return res.status(400).send('sourceAlias is required');

//     const safeTypes = [
//         'OmniScript', 'FlexCard', 'DataRaptor', 'IntegrationProcedure',
//         'OmniStudioTrackingService', 'VlocityUILayout', 'VlocityUITemplate',
//         'CalculationMatrix', 'CalculationProcedure'
//     ];

//     const regularMetadataTypes = [
//         { name: 'ApexClass', members: ['*'] },
//         { name: 'ApexTrigger', members: ['*'] },
//         { name: 'LightningComponentBundle', members: ['*'] }
//     ];

//     const summary = {};

//     // 🔹 Export OmniStudio
//     safeTypes.forEach(type => {
//         const dirPath = path.join(__dirname, type);
//         if (fs.existsSync(dirPath)) {
//             fs.rmSync(dirPath, { recursive: true, force: true });
//         }
//     });

//     const yamlContent = {
//         export: {},
//         exportPacks: {
//             autoAddDependentFields: true,
//             autoAddDependencies: true
//         }
//     };
//     safeTypes.forEach(type => {
//         yamlContent.export[type] = {};
//     });
//     fs.writeFileSync('exportAllOmni.yaml', require('js-yaml').dump(yamlContent));

//     try {
//         const exportCmd = `npx vlocity -sfdx.username ${sourceAlias} packExport -job exportAllOmni.yaml --all --ignoreAllErrors`;
//         execSync(exportCmd, { encoding: 'utf-8', stdio: 'pipe' });

//         safeTypes.forEach(type => {
//             const typeDir = path.join(__dirname, type);
//             if (fs.existsSync(typeDir)) {
//                 const entries = fs.readdirSync(typeDir).filter(entry =>
//                     fs.statSync(path.join(typeDir, entry)).isDirectory()
//                 );
//                 summary[type] = entries;

//                 entries.forEach(name => {
//                     const jsonPath = path.join(typeDir, name, `${name}_DataPack.json`);
//                     if (fs.existsSync(jsonPath)) {
//                         const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
//                         storage.saveComponentWithMetadata(sourceAlias, type, name, data);
//                     }
//                 });
//             }
//         });
//     } catch (err) {
//         console.error('OmniStudio export failed:', err.message);
//     }

//     // 🔐 Get auth token to fetch CreatedDate/ModifiedDate
//     let accessToken, instanceUrl;
//     try {
//         const authInfo = JSON.parse(execSync(`sf org display --target-org ${sourceAlias} --json`, { encoding: 'utf-8' }));
//         accessToken = authInfo.result.accessToken;
//         instanceUrl = authInfo.result.instanceUrl;
//     } catch (err) {
//         console.error('Auth error:', err.message);
//     }

//     // 📅 Fetch OmniStudio timestamps
//     try {
//         for (const type of safeTypes) {
//             if (summary[type] && summary[type].length > 0) {
//                 const omniTimestamps = await storage.fetchOmniComponentDates(instanceUrl, accessToken, type, summary[type]);
//                 summary[type] = summary[type].map(name => {
//                     const dateInfo = omniTimestamps[name] || {};
//                     storage.saveComponentWithMetadata(sourceAlias, type, name, {
//                         name,
//                         type,
//                         ...dateInfo
//                     });
//                     return {
//                         name,
//                         type,
//                         ...dateInfo
//                     };
//                 });
//             }
//         }
//     } catch (err) {
//         console.warn('Failed to fetch OmniStudio component dates:', err.message);
//     }

//     // 🔹 Retrieve Regular Metadata
//     const retrieveTempDir = path.join(__dirname, 'retrieved-metadata');
//     const outputPath = path.join(__dirname, 'sf-output');

//     fs.rmSync(retrieveTempDir, { recursive: true, force: true });
//     fs.rmSync(outputPath, { recursive: true, force: true });
//     fs.mkdirSync(path.join(retrieveTempDir, 'force-app'), { recursive: true });
//     fs.mkdirSync(outputPath, { recursive: true });

//     const sfdxProjectJson = {
//         packageDirectories: [{ path: 'force-app', default: true }],
//         namespace: '',
//         sourceApiVersion: '59.0'
//     };
//     fs.writeFileSync(
//         path.join(retrieveTempDir, 'sfdx-project.json'),
//         JSON.stringify(sfdxProjectJson, null, 2)
//     );

//     const packageXml = {
//         Package: {
//             types: regularMetadataTypes,
//             version: '59.0'
//         }
//     };
//     fs.writeFileSync(
//         path.join(retrieveTempDir, 'package.xml'),
//         xmlBuilder.create(packageXml).end({ pretty: true })
//     );

//     const categorized = {
//         ApexClass: [],
//         ApexTrigger: [],
//         LightningComponentBundle: []
//     };

//     try {
//         const retrieveCmd = `sf project retrieve start --manifest package.xml --target-org ${sourceAlias} --output-dir ${outputPath}`;
//         execSync(retrieveCmd, {
//             cwd: retrieveTempDir,
//             encoding: 'utf-8'
//         });

//         if (fs.existsSync(outputPath)) {
//             const regularFiles = fs.readdirSync(outputPath, { withFileTypes: true })
//                 .flatMap(entry => {
//                     const subDir = path.join(outputPath, entry.name);
//                     return entry.isDirectory()
//                         ? fs.readdirSync(subDir).map(f => `${entry.name}/${f}`)
//                         : [entry.name];
//                 });

//             regularFiles.forEach(filePath => {
//                 if (filePath.startsWith('classes/') && filePath.endsWith('.cls')) {
//                     const name = path.basename(filePath, '.cls');
//                     if (!categorized.ApexClass.includes(name)) {
//                         categorized.ApexClass.push(name);
//                     }
//                 } else if (filePath.startsWith('triggers/') && filePath.endsWith('.trigger')) {
//                     const name = path.basename(filePath, '.trigger');
//                     if (!categorized.ApexTrigger.includes(name)) {
//                         categorized.ApexTrigger.push(name);
//                     }
//                 } else if (filePath.startsWith('lwc/')) {
//                     const name = filePath.split('/')[1];
//                     if (!categorized.LightningComponentBundle.includes(name)) {
//                         categorized.LightningComponentBundle.push(name);
//                     }
//                 }
//             });

//             const allTimestamps = {};
//             for (const [metaType, components] of Object.entries(categorized)) {
//                 if (components.length > 0) {
//                     const ts = await storage.fetchMetadataDatesFromSalesforce(instanceUrl, accessToken, metaType, components);
//                     allTimestamps[metaType] = ts;
//                 }
//             }

//             summary['RegularMetadata'] = {};
//             Object.entries(categorized).forEach(([metaType, components]) => {
//                 summary['RegularMetadata'][metaType] = components.map(name => {
//                     const dateInfo = (allTimestamps[metaType] && allTimestamps[metaType][name]) || {};
//                     storage.saveComponentWithMetadata(sourceAlias, path.join('RegularMetadata', metaType), name, {
//                         name,
//                         type: metaType,
//                         ...dateInfo
//                     });
//                     return {
//                         name,
//                         type: metaType,
//                         ...dateInfo
//                     };
//                 });
//             });

//         } else {
//             summary['RegularMetadata'] = {
//                 ApexClass: [],
//                 ApexTrigger: [],
//                 LightningComponentBundle: []
//             };
//         }
//     } catch (err) {
//         console.warn('Failed to retrieve regular metadata:', err.message);
//         summary['RegularMetadata'] = [`Failed: ${err.message}`];
//     }

//     // Final response
//     summary.timestamp = new Date().toISOString();
//     summary.sourceAlias = sourceAlias;
//     storage.saveIndex(sourceAlias, summary);
//     return res.json(summary);
// });

// app.get('/components', async (req, res) => {
//     const { sourceAlias } = req.query;
//     if (!sourceAlias) return res.status(400).send('sourceAlias is required');

//     const safeTypes = [
//         'OmniScript', 'FlexCard', 'DataRaptor', 'IntegrationProcedure',
//         'OmniStudioTrackingService', 'VlocityUILayout', 'VlocityUITemplate',
//         'CalculationMatrix', 'CalculationProcedure'
//     ];

//     const regularMetadataTypes = [
//         { name: 'ApexClass', members: ['*'] },
//         { name: 'ApexTrigger', members: ['*'] },
//         { name: 'LightningComponentBundle', members: ['*'] }
//     ];

//     const summary = {};
//     const omniScriptKeyMap = {}; // Map: 'Type_Subtype_Language' → 'Name'

//     // Clean existing folders
//     safeTypes.forEach(type => {
//         const dirPath = path.join(__dirname, type);
//         if (fs.existsSync(dirPath)) {
//             fs.rmSync(dirPath, { recursive: true, force: true });
//         }
//     });

//     // YAML config
//     const yamlContent = {
//         export: {},
//         exportPacks: {
//             autoAddDependentFields: true,
//             autoAddDependencies: true
//         }
//     };
//     safeTypes.forEach(type => yamlContent.export[type] = {});
//     fs.writeFileSync('exportAllOmni.yaml', require('js-yaml').dump(yamlContent));

//     try {
//         const exportCmd = `npx vlocity -sfdx.username ${sourceAlias} packExport -job exportAllOmni.yaml --all --ignoreAllErrors`;
//         execSync(exportCmd, { encoding: 'utf-8', stdio: 'pipe' });

//         for (const type of safeTypes) {
//             const typeDir = path.join(__dirname, type);
//             if (!fs.existsSync(typeDir)) continue;

//             const entries = fs.readdirSync(typeDir).filter(entry =>
//                 fs.statSync(path.join(typeDir, entry)).isDirectory()
//             );
//             summary[type] = entries;

//             for (const name of entries) {
//                 const jsonPath = path.join(typeDir, name, `${name}_DataPack.json`);
//                 if (!fs.existsSync(jsonPath)) continue;

//                 const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
//                 storage.saveComponentWithMetadata(sourceAlias, type, name, data);

//                 // Debug only a sample
//                 // if (name === 'Case_Create_English') {
//                 //     console.log(`Raw JSON dump for '${name}':`);
//                 //     console.dir(data, { depth: null });
//                 // }

//                 if (type === 'OmniScript') {
//                     const isOmni = data?.OmniProcessType === 'OmniScript';
//                     const omniName = data?.Name;
//                     const lang = data?.Language;
//                     const subType = data?.SubType;
//                     const omniType = data?.Type;

//                     if (isOmni && omniName && lang && subType && omniType) {
//                         const key = `${omniType}_${subType}_${lang}`;
//                         omniScriptKeyMap[key] = omniName;

//                         console.log('OmniScript Extracted:', {
//                             cliFolder: name,
//                             key,
//                             nameInSF: omniName,
//                             language: lang
//                         });
//                     } else {
//                         console.warn(`Missing OmniScript fields for ${name}:`, {
//                             isOmni, omniName, lang, subType, omniType
//                         });
//                     }
//                 }
//             }
//         }
//     } catch (err) {
//         console.error('OmniStudio export failed:', err.message);
//     }

//     // Auth
//     let accessToken, instanceUrl;
//     try {
//         const authInfo = JSON.parse(execSync(`sf org display --target-org ${sourceAlias} --json`, { encoding: 'utf-8' }));
//         accessToken = authInfo.result.accessToken;
//         instanceUrl = authInfo.result.instanceUrl;
//     } catch (err) {
//         console.error('Auth error:', err.message);
//     }

//     // Fetch Omni component timestamps
//     try {
//         for (const type of safeTypes) {
//             if (summary[type] && summary[type].length > 0) {
//                 const timestampMap = (type === 'OmniScript')
//                     ? await storage.fetchOmniComponentDates(instanceUrl, accessToken, type, summary[type], omniScriptKeyMap)
//                     : await storage.fetchOmniComponentDates(instanceUrl, accessToken, type, summary[type]);

//                 // summary[type] = summary[type].map(name => {
//                 //     const dateInfo = timestampMap[name] || {};
//                 //     storage.saveComponentWithMetadata(sourceAlias, type, name, {
//                 //         name,
//                 //         type,
//                 //         ...dateInfo
//                 //     });
//                 //     return {
//                 //         name,
//                 //         type,
//                 //         ...dateInfo
//                 //     };
//                 // });

//                 summary[type] = summary[type].map(name => {
//                 const raw = timestampMap[name] || {};
//                 const formatted = {
//                     name,
//                     type,
//                     createdDate: raw.createdDate,
//                     lastModifiedDate: raw.lastModifiedDate,
//                     createdDateFormatted: formatDate(raw.createdDate),
//                     lastModifiedDateFormatted: formatDate(raw.lastModifiedDate)
//                 };
//                 storage.saveComponentWithMetadata(sourceAlias, type, name, formatted);
//                 return formatted;
//                             });

//                         }
//                     }
//     } catch (err) {
//         console.warn('Failed to fetch OmniStudio component dates:', err.message);
//     }

//     // Regular metadata (unchanged)
//     const retrieveTempDir = path.join(__dirname, 'retrieved-metadata');
//     const outputPath = path.join(__dirname, 'sf-output');
//     fs.rmSync(retrieveTempDir, { recursive: true, force: true });
//     fs.rmSync(outputPath, { recursive: true, force: true });
//     fs.mkdirSync(path.join(retrieveTempDir, 'force-app'), { recursive: true });
//     fs.mkdirSync(outputPath, { recursive: true });

//     const sfdxProjectJson = {
//         packageDirectories: [{ path: 'force-app', default: true }],
//         namespace: '',
//         sourceApiVersion: '59.0'
//     };
//     fs.writeFileSync(
//         path.join(retrieveTempDir, 'sfdx-project.json'),
//         JSON.stringify(sfdxProjectJson, null, 2)
//     );

//     const packageXml = {
//         Package: {
//             types: regularMetadataTypes,
//             version: '59.0'
//         }
//     };
//     fs.writeFileSync(
//         path.join(retrieveTempDir, 'package.xml'),
//         xmlBuilder.create(packageXml).end({ pretty: true })
//     );

//     const categorized = {
//         ApexClass: [],
//         ApexTrigger: [],
//         LightningComponentBundle: []
//     };

//     try {
//         const retrieveCmd = `sf project retrieve start --manifest package.xml --target-org ${sourceAlias} --output-dir ${outputPath}`;
//         execSync(retrieveCmd, { cwd: retrieveTempDir, encoding: 'utf-8' });

//         const regularFiles = fs.readdirSync(outputPath, { withFileTypes: true })
//             .flatMap(entry => {
//                 const subDir = path.join(outputPath, entry.name);
//                 return entry.isDirectory()
//                     ? fs.readdirSync(subDir).map(f => `${entry.name}/${f}`)
//                     : [entry.name];
//             });

//         regularFiles.forEach(filePath => {
//             if (filePath.startsWith('classes/') && filePath.endsWith('.cls')) {
//                 const name = path.basename(filePath, '.cls');
//                 categorized.ApexClass.push(name);
//             } else if (filePath.startsWith('triggers/') && filePath.endsWith('.trigger')) {
//                 const name = path.basename(filePath, '.trigger');
//                 categorized.ApexTrigger.push(name);
//             } else if (filePath.startsWith('lwc/')) {
//                 const name = filePath.split('/')[1];
//                 categorized.LightningComponentBundle.push(name);
//             }
//         });

//         const allTimestamps = {};
//         for (const [metaType, components] of Object.entries(categorized)) {
//             if (components.length > 0) {
//                 const ts = await storage.fetchMetadataDatesFromSalesforce(instanceUrl, accessToken, metaType, components);
//                 allTimestamps[metaType] = ts;
//             }
//         }

//         summary['RegularMetadata'] = {};
//         Object.entries(categorized).forEach(([metaType, components]) => {
//             summary['RegularMetadata'][metaType] = components.map(name => {
//                 const dateInfo = (allTimestamps[metaType] && allTimestamps[metaType][name]) || {};
//                 storage.saveComponentWithMetadata(sourceAlias, path.join('RegularMetadata', metaType), name, {
//                     name,
//                     type: metaType,
//                     ...dateInfo
//                 });
//                 return {
//                     name,
//                     type: metaType,
//                     ...dateInfo
//                 };
//             });
//         });

//     } catch (err) {
//         console.warn('Failed to retrieve regular metadata:', err.message);
//         summary['RegularMetadata'] = [`Failed: ${err.message}`];
//     }

//     summary.timestamp = new Date().toISOString();
//     summary.sourceAlias = sourceAlias;
//     storage.saveIndex(sourceAlias, summary);
//     return res.json(summary);
// });


// GET: View stored components
// app.get('/stored-components', (req, res) => {
//     const { sourceAlias } = req.query;
//     if (!sourceAlias) return res.status(400).send('sourceAlias is required');

//     const index = storage.getIndex(sourceAlias);
//     if (!index) return res.status(404).send('No stored components found');
//     res.json(index);
// });


// GET: View stored components (with timestamps)
// app.get('/stored-components', (req, res) => {
//     const { sourceAlias } = req.query;
//     if (!sourceAlias) return res.status(400).send('sourceAlias is required');

//     try {
//         const index = storage.getIndex(sourceAlias);
//         if (!index) return res.status(404).send('No stored components found');

//         return res.json(index);  // includes timestamps per your new logic
//     } catch (err) {
//         console.error('Error in /stored-components:', err);
//         return res.status(500).send('Internal server error');
//     }
// });


app.post('/deploy', async (req, res) => {
    const { sourceAlias, targetAlias, selectedComponents } = req.body;
    if (!sourceAlias || !targetAlias || typeof selectedComponents !== 'object') {
        return res.status(400).send('sourceAlias, targetAlias, and selectedComponents {type: [name]} are required');
    }

    console.log(`Starting deployment from ${sourceAlias} to ${targetAlias}`);
    console.log('Selected Components:', JSON.stringify(selectedComponents, null, 2));

    // JWT auth
    try {
        await authenticateWithJWT(
            sourceAlias,
            process.env.SF_CLIENT_ID,
            process.env.SF_USERNAME,
            process.env.SF_LOGIN_URL,
            process.env.SF_JWT_KEY
        );

        await authenticateWithJWT(
            targetAlias,
            process.env.TARGET_CLIENT_ID,
            process.env.TARGET_USERNAME,
            process.env.TARGET_LOGIN_URL,
            process.env.TARGET_JWT_KEY
        );
    } catch (err) {
        console.error('JWT authentication failed:', err.message);
        return res.status(500).json({ status: 'error', message: 'JWT auth failed', details: err.message });
    }

    // packUpdateSettings for both orgs
    try {
        execSync(`npx vlocity -sfdx.username ${sourceAlias} packUpdateSettings`, { stdio: 'inherit' });
        execSync(`npx vlocity -sfdx.username ${targetAlias} packUpdateSettings`, { stdio: 'inherit' });
    } catch (err) {
        console.error('Error updating settings:', err.message);
        return res.status(500).json({ status: 'error', message: 'Settings update failed', details: err.message });
    }

    // Create temp directory and copy components
    const tempDir = './vlocity-temp';
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.mkdirSync(tempDir, { recursive: true });

    const deployYaml = { export: {} };
    for (const [type, items] of Object.entries(selectedComponents)) {
        deployYaml.export[type] = {
            queries: items.map(name => `${type}/${name}`)
        };

        items.forEach(name => {
            const srcDir = path.join(type, name);
            const destDir = path.join(tempDir, type, name);
            if (fs.existsSync(srcDir)) {
                fs.mkdirSync(destDir, { recursive: true });
                fs.readdirSync(srcDir).forEach(file => {
                    fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
                });
            }
        });
    }

    const yamlPath = path.join(tempDir, 'deploySelected.yaml');
    fs.writeFileSync(yamlPath, yaml.dump(deployYaml));

    // Import strip-ansi dynamically (ESM compatibility)
    const stripAnsi = (await import('strip-ansi')).default;
    const deployCmd = `npx vlocity -sfdx.username ${targetAlias} packDeploy -job deploySelected.yaml --force --ignoreAllErrors --nojob`;

    // exec(deployCmd, { cwd: tempDir }, (err, stdout, stderr) => {
    //     const rawOutput = stdout || stderr || '';
    //     const cleanOutput = stripAnsi(rawOutput);

    //     // Parse the output for key info
    //     const deployedComponents = [];
    //     let elapsedTime = '';
    //     let warnings = [];

    //     const lines = cleanOutput.split('\n');
    //     lines.forEach(line => {
    //         if (line.includes('Adding to Deploy >>')) {
    //             const part = line.split('>>')[1]?.trim();
    //             if (part) deployedComponents.push(part);
    //         }

    //         if (line.includes('Elapsed Time')) {
    //             elapsedTime = line.split('>>')[1]?.trim() || '';
    //         }

    //         if (line.toLowerCase().includes('unauthorized') || line.toLowerCase().includes('error')) {
    //             warnings.push(line.trim());
    //         }
    //     });

    //     const response = {
    //         status: err ? 'error' : 'success',
    //         message: err ? 'Deployment failed' : 'Deployment successful',
    //         deployedComponents,
    //         elapsedTime,
    //         warnings,
    //         details: cleanOutput
    //     };

    //     const statusCode = err ? 500 : 200;
    //     return res.status(statusCode).json(response);
    // });

    exec(deployCmd, { cwd: tempDir }, (err, stdout, stderr) => {
    const rawOutput = stdout || stderr || '';
    let cleanOutput = stripAnsi(rawOutput);

    // 🔍 Filter out non-fatal compiler noise
    cleanOutput = cleanOutput
        .split('\n')
        .filter(line =>
            !line.includes('Puppeteer') &&
            !line.includes('@omnistudio/flexcard-compiler') &&
            !line.toLowerCase().includes('unauthorized') &&
            !line.toLowerCase().includes('failed to get package')
        )
        .join('\n');

    const deployedComponents = [];
    let elapsedTime = '';
    let warnings = [];

    const lines = cleanOutput.split('\n');
    lines.forEach(line => {
        if (line.includes('Adding to Deploy >>')) {
            const part = line.split('>>')[1]?.trim();
            if (part) deployedComponents.push(part);
        }
        if (line.includes('Elapsed Time')) {
            elapsedTime = line.split('>>')[1]?.trim() || '';
        }
        if (line.toLowerCase().includes('error')) {
            warnings.push(line.trim());
        }
    });

    const response = {
        status: err ? 'error' : 'success',
        message: err ? 'Deployment failed' : 'Deployment successful',
        deployedComponents,
        elapsedTime,
        warnings,
        details: cleanOutput
    };

    const statusCode = err ? 500 : 200;
    return res.status(statusCode).json(response);
});

});

// Enhanced strict dependency validation
app.post('/detect-dependencies', (req, res) => {
    const { selectedComponents } = req.body;

    if (!selectedComponents || typeof selectedComponents !== 'object') {
        return res.status(400).send('selectedComponents is required and must be an object');
    }

    console.log('[] Starting dependency detection for selected components...\n');

    const missingDeps = {
        FlexCard: {},
        IntegrationProcedure: {},
        DataRaptor: {},
        OmniScript: {}
    };

    const allDeps = {
        FlexCard: {},
        IntegrationProcedure: {},
        DataRaptor: {},
        OmniScript: {}
    };

    const isSelected = (type, name) => selectedComponents[type]?.includes(name);

    for (const [type, names] of Object.entries(selectedComponents)) {
        for (const name of names) {
            console.log(`[] Checking ${type}/${name}`);

            const baseDir = path.join(type, name);
            const dataPackPath = path.join(baseDir, `${name}_DataPack.json`);
            const flexCardJsonPath = path.join(baseDir, `${name}.json`);

            if (!fs.existsSync(dataPackPath)) {
                console.warn(`[] Skipping missing ${dataPackPath}`);
                continue;
            }

            const data = JSON.parse(fs.readFileSync(dataPackPath, 'utf-8'));
            console.log(`[] Loaded DataPack for ${type}/${name}`);

            // Initialize allDeps tracking
            if (!allDeps[type][name]) allDeps[type][name] = {};

            // Standard VlocityDataPackRelationshipType
            const deps = data?.VlocityDataPackRelationshipType || [];
            deps.forEach(dep => {
                const depType = dep.VlocityDataPackType;
                const depName = dep.VlocityDataPackKey.split('/')[1];
                if (!allDeps[type][name][depType]) allDeps[type][name][depType] = [];
                if (!allDeps[type][name][depType].includes(depName)) {
                    allDeps[type][name][depType].push(depName);
                }

                if (!isSelected(depType, depName)) {
                    if (!missingDeps[depType][name]) missingDeps[depType][name] = [];
                    if (!missingDeps[depType][name].includes(depName)) {
                        missingDeps[depType][name].push(depName);
                    }
                }
            });

            // FlexCard special handling
            if (type === 'FlexCard' && fs.existsSync(flexCardJsonPath)) {
                const fc = JSON.parse(fs.readFileSync(flexCardJsonPath, 'utf-8'));
                console.log(`[] FlexCard JSON loaded: ${flexCardJsonPath}`);

                const ipMethod = fc?.dataSource?.value?.ipMethod;
                if (ipMethod) {
                    if (!allDeps[type][name]['IntegrationProcedure']) allDeps[type][name]['IntegrationProcedure'] = [];
                    if (!allDeps[type][name]['IntegrationProcedure'].includes(ipMethod)) {
                        allDeps[type][name]['IntegrationProcedure'].push(ipMethod);
                    }

                    if (!isSelected('IntegrationProcedure', ipMethod)) {
                        if (!missingDeps['IntegrationProcedure'][name]) missingDeps['IntegrationProcedure'][name] = [];
                        if (!missingDeps['IntegrationProcedure'][name].includes(ipMethod)) {
                            missingDeps['IntegrationProcedure'][name].push(ipMethod);
                        }
                    }
                }
            }

            // IntegrationProcedure → DataRaptor detection
            if (type === 'IntegrationProcedure') {
                const files = fs.readdirSync(baseDir);
                for (const file of files) {
                    if (file.includes('_Element_') && file.endsWith('.json')) {
                        const elementPath = path.join(baseDir, file);
                        const element = JSON.parse(fs.readFileSync(elementPath, 'utf-8'));

                        if (element.Type === 'DataRaptor Extract Action') {
                            const dataRaptorName = element.PropertySetConfig?.bundle;
                            if (dataRaptorName) {
                                if (!allDeps[type][name]['DataRaptor']) allDeps[type][name]['DataRaptor'] = [];
                                if (!allDeps[type][name]['DataRaptor'].includes(dataRaptorName)) {
                                    allDeps[type][name]['DataRaptor'].push(dataRaptorName);
                                }

                                if (!isSelected('DataRaptor', dataRaptorName)) {
                                    if (!missingDeps['DataRaptor'][name]) missingDeps['DataRaptor'][name] = [];
                                    if (!missingDeps['DataRaptor'][name].includes(dataRaptorName)) {
                                        missingDeps['DataRaptor'][name].push(dataRaptorName);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    console.log(`\n[] Missing dependencies detected:`, JSON.stringify(missingDeps, null, 2));

    res.json({
        missingDependencies: missingDeps,
        allDependencies: allDeps
    });
});


// Trigger GitLab Pipeline
async function triggerGitlabPipeline() {
    const GITLAB_API_URL = `https://gitlab.com/api/v4/projects/${process.env.GITLAB_PROJECT_ID}/pipeline`;

    try {
        const response = await axios.post(
            GITLAB_API_URL,
            { ref: process.env.GITLAB_BRANCH || 'main' },
            {
                headers: {
                    'Private-Token': process.env.GITLAB_TOKEN,
                    'Content-Type': 'application/json'
                }
            }
        );
        return response.data;
    } catch (err) {
        console.error('GitLab pipeline trigger failed:', err.response?.data || err.message);
        throw err;
    }
}

//** Deploying omni studio and sfdx fixed version*/

app.use(express.json({ limit: '10mb' }));

app.use((req, res, next) => {
    console.log('🔍 Incoming Headers:', req.headers);
    console.log('📦 Incoming Body:', req.body);
    next();
});

// app.post('/deploy-and-git', async (req, res) => {
//     const {
//         sourceAlias,
//         selectedComponents,
//         gitBranch = 'main',
//         commitMessage = 'Exported OmniStudio metadata to Git'
//     } = req.body;

//     if (!sourceAlias || typeof selectedComponents !== 'object') {
//         return res.status(400).json({ status: 'error', message: 'Missing required fields' });
//     }

//     const tempDir = './vlocity_temp';
//     const sfdxTemp = './sfdx-temp';
//     const gitExportDir = './git-export';
//     const exportYamlPath = path.join(tempDir, 'exportDeployGit.yaml');

//     try {
//         // Step 1: Authenticate with JWT
//         await authenticateWithJWT(
//             sourceAlias,
//             process.env.SF_CLIENT_ID,
//             process.env.SF_USERNAME,
//             process.env.SF_LOGIN_URL,
//             process.env.SF_JWT_KEY
//         );

//         // Step 2: Build export YAML
//         const exportYaml = {
//             export: {},
//             exportPacks: {
//                 autoAddDependencies: true,
//                 autoAddDependentFields: true
//             }
//         };

//         for (const [type, names] of Object.entries(selectedComponents)) {
//             if (type === 'RegularMetadata') continue;
//             exportYaml.export[type] = {};
//             names.forEach(name => {
//                 exportYaml.export[type][name] = {};
//             });
//         }

//         // Step 3: Clean folders
//         [tempDir, sfdxTemp, gitExportDir].forEach(dir => fs.rmSync(dir, { recursive: true, force: true }));
//         fs.mkdirSync(tempDir, { recursive: true });

//         // Step 4: Write YAML file
//         const yamlContent = yaml.dump(exportYaml);
//         fs.writeFileSync(exportYamlPath, yamlContent, 'utf8');

//         // Step 5: Run Vlocity export
//         if (Object.keys(exportYaml.export).length > 0) {
//             const exportCmd = `npx vlocity -sfdx.username ${sourceAlias} packExport -job ${exportYamlPath} --projectPath ${__dirname} --ignoreAllErrors`;
//             console.log('Running Vlocity Export:', exportCmd);
//             execSync(exportCmd, { cwd: __dirname, stdio: 'inherit' });

//             // Copy selected OmniStudio components
//             for (const [type, names] of Object.entries(selectedComponents)) {
//                 if (type === 'RegularMetadata') continue;

//                 const srcBase = path.join(__dirname, type);
//                 const destBase = path.join(tempDir, type);

//                 if (!fs.existsSync(srcBase)) {
//                     console.log(`Folder missing for type: ${type}`);
//                     continue;
//                 }

//                 fsExtra.mkdirpSync(destBase);

//                 for (const name of names) {
//                     const srcPath = path.join(srcBase, name);
//                     const destPath = path.join(destBase, name);

//                     if (fs.existsSync(srcPath)) {
//                         console.log(`Copying ${type}/${name}`);
//                         fsExtra.copySync(srcPath, destPath, { overwrite: true });
//                     } else {
//                         console.warn(`Component missing: ${type}/${name}`);
//                     }
//                 }
//             }
//         }

//         // Step 6: Retrieve SFDX metadata
//         if (selectedComponents.RegularMetadata) {
//             const forceAppPath = path.join(sfdxTemp, 'force-app', 'main', 'default');
//             fsExtra.mkdirpSync(forceAppPath);

//             fs.writeFileSync(path.join(sfdxTemp, 'sfdx-project.json'), JSON.stringify({
//                 packageDirectories: [{ path: 'force-app', default: true }],
//                 namespace: '',
//                 sourceApiVersion: '59.0'
//             }, null, 2));

//             // ✅ FIXED: Proper metadata args
//             const metadataList = Object.entries(selectedComponents.RegularMetadata)
//                 .flatMap(([type, names]) => names.map(name => `${type}:${name}`));

//             const metadataArgs = metadataList.map(entry => `--metadata ${entry}`).join(' ');
//             const retrieveCmd = `sf project retrieve start ${metadataArgs} --target-org ${sourceAlias} --output-dir retrieve-temp`;

//             console.log('SFDX Retrieve:', retrieveCmd);
//             execSync(retrieveCmd, { cwd: sfdxTemp, stdio: 'inherit' });
//         }

//         // Step 7: Clone Git repo
//         await simpleGit().clone(process.env.GITLAB_REPO_URL, gitExportDir);
//         console.log('Git repo cloned to:', gitExportDir);

//         // Step 8: Copy OmniStudio to Git repo
//         const omniTarget = path.join(gitExportDir, 'components');
//         fsExtra.mkdirpSync(omniTarget);

//         if (fs.existsSync(tempDir)) {
//             fs.readdirSync(tempDir).forEach(typeFolder => {
//                 const src = path.join(tempDir, typeFolder);
//                 const dest = path.join(omniTarget, typeFolder);
//                 if (fs.statSync(src).isDirectory()) {
//                     console.log(`Copying folder: ${typeFolder}`);
//                     fsExtra.copySync(src, dest, { overwrite: true });
//                 }
//             });
//         }

//         // Step 9: Copy retrieved SFDX metadata
//         const retrievedPath = path.join(sfdxTemp, 'retrieve-temp');
//         const sfdxDefaultTarget = path.join(gitExportDir, 'components', 'sfdx', 'force-app', 'main', 'default');
//         fsExtra.mkdirpSync(sfdxDefaultTarget);

//         if (fs.existsSync(retrievedPath)) {
//             fsExtra.copySync(retrievedPath, sfdxDefaultTarget, { overwrite: true });
//         }

//         // Step 10: Write sfdx-project.json into Git
//         fs.writeFileSync(path.join(gitExportDir, 'components', 'sfdx', 'sfdx-project.json'), JSON.stringify({
//             packageDirectories: [{ path: 'force-app', default: true }],
//             namespace: '',
//             sourceApiVersion: '59.0'
//         }, null, 2));

//         // Step 11: Git commit & push
//         const git = simpleGit(gitExportDir);
//         await git.addConfig('user.email', process.env.GIT_COMMIT_EMAIL || 'omni-deploy@tgs.com');
//         await git.addConfig('user.name', process.env.GIT_COMMIT_NAME || 'Omni Deployer');
//         await git.checkout(gitBranch);
//         await git.add('./*');
//         await git.commit(commitMessage);
//         await git.push('origin', gitBranch);

//         // Step 12: Trigger pipeline
//         const pipelineData = await triggerGitlabPipeline();

//         return res.status(200).json({
//             status: 'success',
//             message: 'Selected OmniStudio + SFDX metadata exported to Git!',
//             pipeline: {
//                 id: pipelineData.id,
//                 status: pipelineData.status,
//                 url: pipelineData.web_url,
//                 ref: pipelineData.ref,
//                 created_at: pipelineData.created_at
//             }
//         });

//     } catch (err) {
//         console.error('deploy-and-git error:', err.message || err);
//         return res.status(500).json({
//             status: 'error',
//             message: err.message || 'Unexpected error during deploy-and-git'
//         });
//     }
// });

//** Roll Back Via Commit Id */
// app.post('/rollback', async (req, res) => {
//     const { branch, commitId } = req.body;

//     console.log('Incoming Headers:', req.headers);
//     console.log('Incoming Body:', req.body);

//     if (!branch || !commitId) {
//         return res.status(400).json({
//             status: 'error',
//             message: 'Missing required fields: branch and commitId'
//         });
//     }

//     try {
//         // Step 1: Clean up previous clone if exists
//         if (fs.existsSync(gitExportDir)) {
//             fs.rmSync(gitExportDir, { recursive: true, force: true });
//             console.log('Cleaned previous git-export directory');
//         }

//         // Step 2: Clone fresh repo from GitLab
//         console.log(`Cloning Git repo from ${repoUrl}`);
//         await simpleGit().clone(repoUrl, gitExportDir);

//         const git = simpleGit(gitExportDir);

//         //Step 3: Checkout to the correct branch
//         await git.checkout(branch);
//         console.log(`Checked out to branch: ${branch}`);

//             // Configure Git identity for revert commit
//         await git.addConfig('user.email', 'dx-bot@tgs.com');
//         await git.addConfig('user.name', 'TGS DX Bot');
//         console.log('Configured Git user identity');

//         //Step 4: Ensure commit ID exists (short or full match)
//         const log = await git.log();
//         const matchedCommit = log.all.find(c => c.hash.startsWith(commitId));

//         if (!matchedCommit) {
//             return res.status(400).json({
//                 status: 'error',
//                 message: `Commit ${commitId} not found in Git log.`
//             });
//         }

//         //Step 5: Revert the commit
//         console.log(`Reverting commit ${commitId}`);
//         await git.raw(['revert', '--no-edit', commitId]);

//         //Step 6: Push the new revert commit to remote
//         await git.push('origin', branch);

//         return res.status(200).json({
//             status: 'success',
//             message: `Rollback of commit ${commitId} completed and pushed to ${branch}.`
//         });

//     } catch (err) {
//         console.error('Rollback failed:', err.message || err);
//         return res.status(500).json({
//             status: 'error',
//             message: err.message || 'Unexpected error during rollback'
//         });
//     }
// });


//** Get Commits  correct older code*/
// app.get('/commits', async (req, res) => {
//     const branch = req.query.branch || 'main';
//     const gitExportDir = './git-export';
//     const repoUrl = process.env.GITLAB_REPO_URL;

//     try {
//         // Clean previous clone (optional for freshness)
//         if (fs.existsSync(gitExportDir)) {
//             fs.rmSync(gitExportDir, { recursive: true, force: true });
//         }

//         console.log('Cloning Git repo...');
//         await simpleGit().clone(repoUrl, gitExportDir);

//         const git = simpleGit(gitExportDir);
//         await git.checkout(branch);

//         const log = await git.log({ n: 20 });

//         const commits = log.all.map(commit => ({
//             hash: commit.hash,
//             shortHash: commit.hash.substring(0, 8),
//             message: commit.message,
//             author: commit.author_name,
//             date: commit.date
//         }));

//         return res.status(200).json({
//             status: 'success',
//             commits
//         });

//     } catch (err) {
//         console.error('Error fetching commits:', err.message || err);
//         return res.status(500).json({
//             status: 'error',
//             message: err.message || 'Failed to fetch commits'
//         });
//     }
// });

//** Get Commits new List */
// app.get('/commits', async (req, res) => {
//     const branch = req.query.branch;
//     const gitExportDir = './git-export';
//     const repoUrl = process.env.GITLAB_REPO_URL;

//     if (!branch) {
//         return res.status(400).json({ status: 'error', message: 'Missing branch param' });
//     }

//     try {
//         if (fs.existsSync(gitExportDir)) {
//             fs.rmSync(gitExportDir, { recursive: true, force: true });
//         }

//         await simpleGit().clone(repoUrl, gitExportDir);
//         const git = simpleGit(gitExportDir);
//         await git.fetch();

//         const branches = await git.branch(['-a']);
//         const isLocal = Object.keys(branches.branches).includes(branch);
//         const remoteBranchName = `remotes/origin/${branch}`;
//         const isRemote = Object.keys(branches.branches).includes(remoteBranchName);

//         if (isLocal) {
//             await git.checkout(branch);
//         } else if (isRemote) {
//             await git.checkoutBranch(branch, remoteBranchName);
//         } else {
//             return res.status(404).json({
//                 status: 'error',
//                 message: `Branch '${branch}' not found in local or remote`
//             });
//         }

//         const log = await git.log({ n: 20 });

//         const commits = log.all.map(commit => ({
//             hash: commit.hash,
//             shortHash: commit.hash.substring(0, 8),
//             message: commit.message,
//             author: commit.author_name,
//             date: commit.date
//         }));

//         return res.status(200).json({
//             status: 'success',
//             branch,
//             commits
//         });

//     } catch (err) {
//         console.error('Error fetching commits:', err.message || err);
//         return res.status(500).json({
//             status: 'error',
//             message: err.message || 'Failed to fetch commits'
//         });
//     }
// });


//** Get Branches List */
app.get('/branches', async (req, res) => {
    const gitExportDir = './git-export';
    const repoUrl = process.env.GITLAB_REPO_URL;

    try {
        // Clean previous clone
        if (fs.existsSync(gitExportDir)) {
            fs.rmSync(gitExportDir, { recursive: true, force: true });
        }

        await simpleGit().clone(repoUrl, gitExportDir);
        const git = simpleGit(gitExportDir);
        await git.fetch();

        const branches = await git.branch(['-a']);

        const uniqueBranchNames = new Set();

        Object.keys(branches.branches).forEach(branchName => {
            if (branchName.startsWith('remotes/origin/')) {
                const clean = branchName.replace('remotes/origin/', '');
                if (clean !== 'HEAD') uniqueBranchNames.add(clean);
            } else {
                uniqueBranchNames.add(branchName);
            }
        });

        const sortedBranches = Array.from(uniqueBranchNames).sort();

        return res.status(200).json({
            status: 'success',
            branches: sortedBranches
        });

    } catch (err) {
        console.error('Failed to fetch branches:', err.message || err);
        return res.status(500).json({
            status: 'error',
            message: err.message || 'Unable to get branches'
        });
    }
});


// app.get('/stored-components', (req, res) => {
//     const { sourceAlias } = req.query;
//     if (!sourceAlias) return res.status(400).send('sourceAlias is required');

//     try {
//         const index = storage.getIndex(sourceAlias);
//         if (!index || typeof index !== 'object') {
//             return res.status(404).send('No stored components found');
//         }

//         const releasesPath = path.join(__dirname, 'storage', sourceAlias, 'releases');
//         let latestRelease = null;

//         if (fs.existsSync(releasesPath)) {
//             const releaseFiles = fs.readdirSync(releasesPath).filter(f => f.endsWith('.json'));
//             const sorted = releaseFiles
//                 .map(f => {
//                     const release = JSON.parse(fs.readFileSync(path.join(releasesPath, f), 'utf-8'));
//                     return {
//                         file: f,
//                         deployedAt: new Date(release.deployedAt),
//                         data: release
//                     };
//                 })
//                 .sort((a, b) => b.deployedAt - a.deployedAt);

//             if (sorted.length > 0) {
//                 latestRelease = sorted[0].data;
//             }
//         }

//         const groupedIndex = {};
//         const deployedAt = latestRelease ? new Date(latestRelease.deployedAt) : null;

//         for (const [type, components] of Object.entries(index)) {
//             if (!Array.isArray(components)) {
//                 console.warn(`Skipping type "${type}" — not an array`);
//                 continue;
//             }

//             const visibleItems = components
//                 .map(comp => {
//                     let wasDeployed = false;

//                     if (type === 'RegularMetadata') {
//                         const nestedDeployed = latestRelease?.components?.RegularMetadata || {};
//                         const subtype = comp.type; // ApexClass, ApexTrigger, etc.
//                         if (nestedDeployed[subtype]?.includes(comp.name)) {
//                             wasDeployed = true;
//                         }
//                     } else {
//                         if (latestRelease?.components?.[type]?.includes(comp.name)) {
//                             wasDeployed = true;
//                         }
//                     }

//                     const rawDate = comp.lastModifiedDateFormatted || comp.lastModifiedDate || comp.lastModifiedDateTime;
//                     let lastModified = null;
//                     try {
//                         lastModified = rawDate ? new Date(rawDate) : null;
//                     } catch {
//                         lastModified = null;
//                     }

//                     const isChanged = !wasDeployed || (lastModified && deployedAt && lastModified > deployedAt);

//                     return {
//                         ...comp,
//                         wasPreviouslyDeployed: wasDeployed,
//                         modifiedAfterDeployment: isChanged
//                     };
//                 })
//                 .filter(c => !c.wasPreviouslyDeployed || c.modifiedAfterDeployment);

//             groupedIndex[type] = visibleItems;
//         }

//         console.log('Deployed components in latestRelease:', JSON.stringify(latestRelease?.components, null, 2));
//         console.log('Grouped Index keys returned:', Object.keys(groupedIndex));

//         return res.json(groupedIndex);
//     } catch (err) {
//         console.error('Error in /stored-components:', err);
//         return res.status(500).send('Internal server error');
//     }
// });



function flattenSelectedComponents(selectedComponents) {
    const flatMap = {};

    for (const [type, value] of Object.entries(selectedComponents)) {
        if (type === 'RegularMetadata' && typeof value === 'object') {
            if (!flatMap.RegularMetadata) flatMap.RegularMetadata = {};
            for (const [subType, names] of Object.entries(value)) {
                if (!flatMap.RegularMetadata[subType]) flatMap.RegularMetadata[subType] = [];
                flatMap.RegularMetadata[subType].push(...names);
            }
        } else {
            if (!flatMap[type]) flatMap[type] = [];
            flatMap[type].push(...value);
        }
    }

    return flatMap;
}



// app.post('/deploy-and-git', async (req, res) => {
//     const {
//         sourceAlias,
//         selectedComponents,
//         gitBranch = 'main',
//         commitMessage = 'Exported OmniStudio metadata to Git'
//     } = req.body;

//     if (!sourceAlias || typeof selectedComponents !== 'object') {
//         return res.status(400).json({ status: 'error', message: 'Missing required fields' });
//     }

//     const tempDir = './vlocity_temp';
//     const sfdxTemp = './sfdx-temp';
//     const gitExportDir = './git-export';
//     const exportYamlPath = path.join(tempDir, 'exportDeployGit.yaml');

//     try {
//         await authenticateWithJWT(
//             sourceAlias,
//             process.env.SF_CLIENT_ID,
//             process.env.SF_USERNAME,
//             process.env.SF_LOGIN_URL,
//             process.env.SF_JWT_KEY
//         );

//         const exportYaml = {
//             export: {},
//             exportPacks: {
//                 autoAddDependencies: true,
//                 autoAddDependentFields: true
//             }
//         };

//         for (const [type, names] of Object.entries(selectedComponents)) {
//             if (type === 'RegularMetadata') continue;
//             exportYaml.export[type] = {};
//             names.forEach(name => {
//                 exportYaml.export[type][name] = {};
//             });
//         }

//         [tempDir, sfdxTemp, gitExportDir].forEach(dir => fs.rmSync(dir, { recursive: true, force: true }));
//         fs.mkdirSync(tempDir, { recursive: true });

//         const yamlContent = yaml.dump(exportYaml);
//         fs.writeFileSync(exportYamlPath, yamlContent, 'utf8');

//         if (Object.keys(exportYaml.export).length > 0) {
//             const exportCmd = `npx vlocity -sfdx.username ${sourceAlias} packExport -job ${exportYamlPath} --projectPath ${__dirname} --ignoreAllErrors`;
//             console.log('Running Vlocity Export:', exportCmd);
//             execSync(exportCmd, { cwd: __dirname, stdio: 'inherit' });

//             for (const [type, names] of Object.entries(selectedComponents)) {
//                 if (type === 'RegularMetadata') continue;

//                 const srcBase = path.join(__dirname, type);
//                 const destBase = path.join(tempDir, type);

//                 if (!fs.existsSync(srcBase)) {
//                     console.log(`Folder missing for type: ${type}`);
//                     continue;
//                 }

//                 fsExtra.mkdirpSync(destBase);

//                 for (const name of names) {
//                     const srcPath = path.join(srcBase, name);
//                     const destPath = path.join(destBase, name);

//                     if (fs.existsSync(srcPath)) {
//                         console.log(`Copying ${type}/${name}`);
//                         fsExtra.copySync(srcPath, destPath, { overwrite: true });
//                     } else {
//                         console.warn(`Component missing: ${type}/${name}`);
//                     }
//                 }
//             }
//         }

//         if (selectedComponents.RegularMetadata) {
//             const forceAppPath = path.join(sfdxTemp, 'force-app', 'main', 'default');
//             fsExtra.mkdirpSync(forceAppPath);

//             fs.writeFileSync(path.join(sfdxTemp, 'sfdx-project.json'), JSON.stringify({
//                 packageDirectories: [{ path: 'force-app', default: true }],
//                 namespace: '',
//                 sourceApiVersion: '59.0'
//             }, null, 2));

//             const metadataList = Object.entries(selectedComponents.RegularMetadata)
//                 .flatMap(([type, names]) => names.map(name => `${type}:${name}`));

//             const metadataArgs = metadataList.map(entry => `--metadata ${entry}`).join(' ');
//             const retrieveCmd = `sf project retrieve start ${metadataArgs} --target-org ${sourceAlias} --output-dir retrieve-temp`;

//             console.log('SFDX Retrieve:', retrieveCmd);
//             execSync(retrieveCmd, { cwd: sfdxTemp, stdio: 'inherit' });
//         }

//         await simpleGit().clone(process.env.GITLAB_REPO_URL, gitExportDir);
//         console.log('Git repo cloned to:', gitExportDir);

//         const omniTarget = path.join(gitExportDir, 'components');
//         fsExtra.mkdirpSync(omniTarget);

//         if (fs.existsSync(tempDir)) {
//             fs.readdirSync(tempDir).forEach(typeFolder => {
//                 const src = path.join(tempDir, typeFolder);
//                 const dest = path.join(omniTarget, typeFolder);
//                 if (fs.statSync(src).isDirectory()) {
//                     console.log(`Copying folder: ${typeFolder}`);
//                     fsExtra.copySync(src, dest, { overwrite: true });
//                 }
//             });
//         }

//         const retrievedPath = path.join(sfdxTemp, 'retrieve-temp');
//         const sfdxDefaultTarget = path.join(gitExportDir, 'components', 'sfdx', 'force-app', 'main', 'default');
//         fsExtra.mkdirpSync(sfdxDefaultTarget);

//         if (fs.existsSync(retrievedPath)) {
//             fsExtra.copySync(retrievedPath, sfdxDefaultTarget, { overwrite: true });
//         }

//         fs.writeFileSync(path.join(gitExportDir, 'components', 'sfdx', 'sfdx-project.json'), JSON.stringify({
//             packageDirectories: [{ path: 'force-app', default: true }],
//             namespace: '',
//             sourceApiVersion: '59.0'
//         }, null, 2));

//         const releaseId = `release-${new Date().toISOString().replace(/[:.]/g, '-')}`;
//         const deployedAt = new Date().toISOString();
//         const deployedBy = process.env.GIT_COMMIT_NAME || 'Omni Deployer';

//         const flattenedComponents = flattenSelectedComponents(selectedComponents);

//         const releaseMetadata = {
//             releaseName: releaseId,
//             deployedAt,
//             deployedBy,
//             sourceAlias,
//             components: flattenedComponents
//         };

//         const localReleaseDir = path.join(__dirname, 'storage', sourceAlias, 'releases');
//         fs.mkdirSync(localReleaseDir, { recursive: true });
//         fs.writeFileSync(
//             path.join(localReleaseDir, `${releaseId}.json`),
//             JSON.stringify(releaseMetadata, null, 2)
//         );

//         const releaseGitDir = path.join(gitExportDir, 'components', 'releases');
//         fs.mkdirSync(releaseGitDir, { recursive: true });
//         fs.writeFileSync(
//             path.join(releaseGitDir, `${releaseId}.json`),
//             JSON.stringify(releaseMetadata, null, 2)
//         );

//         const git = simpleGit(gitExportDir);
//         await git.addConfig('user.email', process.env.GIT_COMMIT_EMAIL || 'omni-deploy@tgs.com');
//         await git.addConfig('user.name', process.env.GIT_COMMIT_NAME || 'Omni Deployer');
//         await git.checkout(gitBranch);
//         await git.add('./*');
//         await git.commit(`Release: ${releaseId} — ${commitMessage}`);
//         await git.push('origin', gitBranch);
//         await git.addTag(releaseId);
//         await git.pushTags('origin');

//         const pipelineData = await triggerGitlabPipeline();

//         return res.status(200).json({
//             status: 'success',
//             message: 'Selected OmniStudio + SFDX metadata exported to Git!',
//             release: releaseMetadata,
//             pipeline: {
//                 id: pipelineData.id,
//                 status: pipelineData.status,
//                 url: pipelineData.web_url,
//                 ref: pipelineData.ref,
//                 created_at: pipelineData.created_at
//             }
//         });

//     } catch (err) {
//         console.error('deploy-and-git error:', err.message || err);
//         return res.status(500).json({
//             status: 'error',
//             message: err.message || 'Unexpected error during deploy-and-git'
//         });
//     }
// });


// app.post('/rollback', async (req, res) => {
//     const { branch, commitId } = req.body;

//     if (!branch || !commitId) {
//         return res.status(400).json({
//             status: 'error',
//             message: 'Missing required fields: branch and commitId'
//         });
//     }

//     try {
//         if (fs.existsSync(gitExportDir)) {
//             fs.rmSync(gitExportDir, { recursive: true, force: true });
//         }

//         await simpleGit().clone(repoUrl, gitExportDir);
//         const git = simpleGit(gitExportDir);

//         await git.checkout(branch);
//         await git.addConfig('user.email', 'dx-bot@tgs.com');
//         await git.addConfig('user.name', 'TGS DX Bot');

//         // Get list of files added/modified in the commit
//         const diffOutput = await git.raw([
//             'diff-tree',
//             '--no-commit-id',
//             '--name-status',
//             '-r',
//             commitId
//         ]);

//         const lines = diffOutput.trim().split('\n');

//         if (lines.length === 0) {
//             return res.status(404).json({
//                 status: 'error',
//                 message: `No files found in commit ${commitId}`
//             });
//         }

//         const filesToDelete = [];

//         for (const line of lines) {
//             const [status, filePath] = line.split('\t');

//             // We're only interested in added or modified files
//             if (['A', 'M'].includes(status)) {
//                 const fullPath = path.join(gitExportDir, filePath);
//                 if (fs.existsSync(fullPath)) {
//                     fs.unlinkSync(fullPath);
//                     await git.rm(filePath);
//                     filesToDelete.push(filePath);
//                 }
//             }
//         }

//         if (filesToDelete.length === 0) {
//             return res.status(400).json({
//                 status: 'error',
//                 message: 'No deletable files found for this commit.'
//             });
//         }

//         await git.commit(`Rollback of commit ${commitId} - deleted added/changed files`);
//         await git.push('origin', branch);

//         return res.status(200).json({
//             status: 'success',
//             message: `Rollback of commit ${commitId} completed.`,
//             deletedFiles: filesToDelete
//         });

//     } catch (err) {
//         console.error('Rollback failed:', err.message || err);
//         return res.status(500).json({
//             status: 'error',
//             message: err.message || 'Unexpected error during rollback'
//         });
//     }
// });


/******************  ******************new code section  ********************* */

/**git deploy with release folder structure */
// app.post('/deploy-and-git', async (req, res) => {
//     const {
//         sourceAlias,
//         selectedComponents,
//         gitBranch,
//         commitMessage,
//         releaseName
//     } = req.body;

//     if (!sourceAlias || typeof selectedComponents !== 'object') {
//         return res.status(400).json({ status: 'error', message: 'Missing required fields' });
//     }

//     const tempDir = './vlocity_temp';
//     const sfdxTemp = './sfdx-temp';
//     const gitExportDir = './git-export';
//     const exportYamlPath = path.join(tempDir, 'exportDeployGit.yaml');

//     try {
//         await authenticateWithJWT(
//             sourceAlias,
//             process.env.SF_CLIENT_ID,
//             process.env.SF_USERNAME,
//             process.env.SF_LOGIN_URL,
//             process.env.SF_JWT_KEY
//         );

//         // Clean dirs
//         [tempDir, sfdxTemp, gitExportDir].forEach(dir => fs.rmSync(dir, { recursive: true, force: true }));
//         fs.mkdirSync(tempDir, { recursive: true });

//         const exportYaml = {
//             export: {},
//             exportPacks: {
//                 autoAddDependencies: true,
//                 autoAddDependentFields: true
//             }
//         };

//         for (const [type, names] of Object.entries(selectedComponents)) {
//             if (type === 'RegularMetadata') continue;
//             exportYaml.export[type] = {};
//             names.forEach(name => {
//                 exportYaml.export[type][name] = {};
//             });
//         }

//         const yamlContent = yaml.dump(exportYaml);
//         fs.writeFileSync(exportYamlPath, yamlContent, 'utf8');

//         // Run Vlocity export
//         if (Object.keys(exportYaml.export).length > 0) {
//             const exportCmd = `npx vlocity -sfdx.username ${sourceAlias} packExport -job ${exportYamlPath} --projectPath ${__dirname} --ignoreAllErrors`;
//             console.log('Running Vlocity Export:', exportCmd);
//             execSync(exportCmd, { cwd: __dirname, stdio: 'inherit' });

//             for (const [type, names] of Object.entries(selectedComponents)) {
//                 if (type === 'RegularMetadata') continue;

//                 const srcBase = path.join(__dirname, type);
//                 const destBase = path.join(tempDir, type);
//                 if (!fs.existsSync(srcBase)) continue;

//                 fsExtra.mkdirpSync(destBase);
//                 for (const name of names) {
//                     const srcPath = path.join(srcBase, name);
//                     const destPath = path.join(destBase, name);
//                     if (fs.existsSync(srcPath)) {
//                         fsExtra.copySync(srcPath, destPath, { overwrite: true });
//                     }
//                 }
//             }
//         }

//         // Handle SFDX metadata
//         if (selectedComponents.RegularMetadata) {
//             const forceAppPath = path.join(sfdxTemp, 'force-app', 'main', 'default');
//             fsExtra.mkdirpSync(forceAppPath);

//             fs.writeFileSync(path.join(sfdxTemp, 'sfdx-project.json'), JSON.stringify({
//                 packageDirectories: [{ path: 'force-app', default: true }],
//                 namespace: '',
//                 sourceApiVersion: '59.0'
//             }, null, 2));

//             const metadataList = Object.entries(selectedComponents.RegularMetadata)
//                 .flatMap(([type, names]) => names.map(name => `${type}:${name}`));
//             const metadataArgs = metadataList.map(entry => `--metadata ${entry}`).join(' ');

//             const retrieveCmd = `sf project retrieve start ${metadataArgs} --target-org ${sourceAlias} --output-dir retrieve-temp`;
//             execSync(retrieveCmd, { cwd: sfdxTemp, stdio: 'inherit' });
//         }

//         // Git clone
//         await simpleGit().clone(process.env.GITLAB_REPO_URL, gitExportDir);
//         const componentsDir = path.join(gitExportDir, 'components');
//         fs.mkdirSync(componentsDir, { recursive: true });

//         // Timestamp + release name
//         const now = new Date();
//         const pad = (n) => n.toString().padStart(2, '0');
//         const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
//         const releaseId = `release-${timestamp}Z`;

//         const deployedAt = now.toISOString();
//         const deployedAtFormatted = now.toLocaleString('en-IN', {
//             weekday: 'long',
//             year: 'numeric',
//             month: 'short',
//             day: 'numeric',
//             hour: '2-digit',
//             minute: '2-digit',
//             hour12: true,
//             timeZone: 'Asia/Kolkata',
//             timeZoneName: 'short'
//         });

//         const safeReleaseName = releaseName ? releaseName.trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-_]/g, '') : '';
//         const releaseFolderName = safeReleaseName ? `${safeReleaseName}__${releaseId}` : releaseId;
//         const releaseFolder = path.join(componentsDir, releaseFolderName);
//         fsExtra.mkdirpSync(releaseFolder);

//         // Copy Omni metadata
//         if (fs.existsSync(tempDir)) {
//             fs.readdirSync(tempDir).forEach(typeFolder => {
//                 const src = path.join(tempDir, typeFolder);
//                 const dest = path.join(releaseFolder, typeFolder);
//                 if (fs.statSync(src).isDirectory()) {
//                     fsExtra.copySync(src, dest, { overwrite: true });
//                 }
//             });
//         }

//         // Copy SFDX
//         const retrievedPath = path.join(sfdxTemp, 'retrieve-temp');
//         const sfdxTarget = path.join(releaseFolder, 'sfdx', 'force-app', 'main', 'default');
//         fsExtra.mkdirpSync(sfdxTarget);

//         if (fs.existsSync(retrievedPath)) {
//             fsExtra.copySync(retrievedPath, sfdxTarget, { overwrite: true });
//         }

//         fs.writeFileSync(path.join(releaseFolder, 'sfdx', 'sfdx-project.json'), JSON.stringify({
//             packageDirectories: [{ path: 'force-app', default: true }],
//             namespace: '',
//             sourceApiVersion: '59.0'
//         }, null, 2));

//         const deployedBy = process.env.GIT_COMMIT_NAME || 'Omni Deployer';
//         const flattenedComponents = flattenSelectedComponents(selectedComponents);

//         const releaseMetadata = {
//             releaseId,
//             releaseName: releaseName || '',
//             deployedAt,
//             deployedAtFormatted,
//             deployedBy,
//             sourceAlias,
//             components: flattenedComponents,
//             gitBranch
//         };

//         fs.writeFileSync(path.join(releaseFolder, 'release.json'), JSON.stringify(releaseMetadata, null, 2));

//         // Track in releases
//         const releaseHistoryDir = path.join(componentsDir, 'releases');
//         fs.mkdirSync(releaseHistoryDir, { recursive: true });
//         fs.writeFileSync(path.join(releaseHistoryDir, `${releaseId}.json`), JSON.stringify(releaseMetadata, null, 2));

//         // Timestamp marker
//         const metaDir = path.join(componentsDir, '.meta');
//         fsExtra.mkdirpSync(metaDir);
//         const timestampFile = path.join(metaDir, `.last-deploy-${Date.now()}.txt`);
//         fs.writeFileSync(timestampFile, 'Deployed at ' + deployedAt);

//         // Git commit/tag
//         const git = simpleGit(gitExportDir);
//         await git.addConfig('user.email', process.env.GIT_COMMIT_EMAIL || 'omni-deploy@tgs.com');
//         await git.addConfig('user.name', deployedBy);
//         await git.checkout(gitBranch);
//         await git.add('--all');

//         const fullTagName = releaseFolderName;
//         await git.commit(`Release: ${fullTagName} — ${commitMessage}`);
//         await git.push('origin', gitBranch);
//         await git.addTag(fullTagName);
//         await git.pushTags('origin');

//         const pipelineData = await triggerGitlabPipeline();

//         return res.status(200).json({
//             status: 'success',
//             message: 'Selected OmniStudio + SFDX metadata exported to Git!',
//             release: releaseMetadata,
//             pipeline: {
//                 id: pipelineData.id,
//                 status: pipelineData.status,
//                 url: pipelineData.web_url,
//                 ref: pipelineData.ref,
//                 created_at: pipelineData.created_at
//             }
//         });

//     } catch (err) {
//         console.error('deploy-and-git error:', err.message || err);
//         return res.status(500).json({
//             status: 'error',
//             message: err.message || 'Unexpected error during deploy-and-git'
//         });
//     }
// });


app.post('/deploy-and-git', async (req, res) => {
    const {
        sourceAlias,
        selectedComponents,
        gitBranch,
        commitMessage,
        releaseName
    } = req.body;

    if (!sourceAlias || typeof selectedComponents !== 'object') {
        return res.status(400).json({ status: 'error', message: 'Missing required fields' });
    }

    const tempDir = './vlocity_temp';
    const sfdxTemp = './sfdx-temp';
    const gitExportDir = './git-export';
    const exportYamlPath = path.join(tempDir, 'exportDeployGit.yaml');

    try {
        await authenticateWithJWT(
            sourceAlias,
            process.env.SF_CLIENT_ID,
            process.env.SF_USERNAME,
            process.env.SF_LOGIN_URL,
            process.env.SF_JWT_KEY
        );

        // Clean dirs
        [tempDir, sfdxTemp, gitExportDir].forEach(dir => fs.rmSync(dir, { recursive: true, force: true }));
        fs.mkdirSync(tempDir, { recursive: true });

        const exportYaml = {
            export: {},
            exportPacks: {
                autoAddDependencies: true,
                autoAddDependentFields: true
            }
        };

        for (const [type, names] of Object.entries(selectedComponents)) {
            if (type === 'RegularMetadata') continue;
            exportYaml.export[type] = {};
            names.forEach(name => {
                exportYaml.export[type][name] = {};
            });
        }

        const yamlContent = yaml.dump(exportYaml);
        fs.writeFileSync(exportYamlPath, yamlContent, 'utf8');

        // Run Vlocity export
        if (Object.keys(exportYaml.export).length > 0) {
            const exportCmd = `npx vlocity -sfdx.username ${sourceAlias} packExport -job ${exportYamlPath} --projectPath ${__dirname} --ignoreAllErrors`;
            console.log('Running Vlocity Export:', exportCmd);
            execSync(exportCmd, { cwd: __dirname, stdio: 'inherit' });

            for (const [type, names] of Object.entries(selectedComponents)) {
                if (type === 'RegularMetadata') continue;

                const srcBase = path.join(__dirname, type);
                const destBase = path.join(tempDir, type);
                if (!fs.existsSync(srcBase)) continue;

                fsExtra.mkdirpSync(destBase);
                for (const name of names) {
                    const srcPath = path.join(srcBase, name);
                    const destPath = path.join(destBase, name);
                    if (fs.existsSync(srcPath)) {
                        fsExtra.copySync(srcPath, destPath, { overwrite: true });
                    }
                }
            }
        }

        // Handle SFDX metadata
        if (selectedComponents.RegularMetadata) {
            const forceAppPath = path.join(sfdxTemp, 'force-app', 'main', 'default');
            fsExtra.mkdirpSync(forceAppPath);

            fs.writeFileSync(path.join(sfdxTemp, 'sfdx-project.json'), JSON.stringify({
                packageDirectories: [{ path: 'force-app', default: true }],
                namespace: '',
                sourceApiVersion: '59.0'
            }, null, 2));

            const metadataList = Object.entries(selectedComponents.RegularMetadata)
                .flatMap(([type, names]) => names.map(name => `${type}:${name}`));
            const metadataArgs = metadataList.map(entry => `--metadata ${entry}`).join(' ');

            const retrieveCmd = `sf project retrieve start ${metadataArgs} --target-org ${sourceAlias} --output-dir retrieve-temp`;
            execSync(retrieveCmd, { cwd: sfdxTemp, stdio: 'inherit' });
        }

        // Git clone
        await simpleGit().clone(process.env.GITLAB_REPO_URL, gitExportDir);
        const componentsDir = path.join(gitExportDir, 'components');
        fs.mkdirSync(componentsDir, { recursive: true });

        // Timestamp + release name
        const now = new Date();
        const pad = (n) => n.toString().padStart(2, '0');
        const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
        // const releaseId = `release-${timestamp}Z`;
        // const incomingReleaseId = req.body.releaseId; // from re-deploy
        // const releaseId = incomingReleaseId || `release-${timestamp}Z`;

        const incomingReleaseId = req.body.releaseId;
        let releaseId;

        if (incomingReleaseId) {
        // Re-deploy scenario
        releaseId = incomingReleaseId;
        console.log(`Re-deploying to existing releaseId: ${releaseId}`);
        } else {
        // New deploy scenario
        const now = new Date();
        const pad = (n) => n.toString().padStart(2, '0');
        const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
        releaseId = `release-${timestamp}Z`;
        console.log(`New release created: ${releaseId}`);
        }



        const deployedAt = now.toISOString();
        const deployedAtFormatted = now.toLocaleString('en-IN', {
            weekday: 'long',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
            timeZone: 'Asia/Kolkata',
            timeZoneName: 'short'
        });

        // const safeReleaseName = releaseName ? releaseName.trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-_]/g, '') : '';
        // const releaseFolderName = safeReleaseName ? `${safeReleaseName}__${releaseId}` : releaseId;
        const releaseFolderName = releaseId;
        const releaseFolder = path.join(componentsDir, releaseFolderName);
        fsExtra.mkdirpSync(releaseFolder);

        // Copy Omni metadata
        if (fs.existsSync(tempDir)) {
            fs.readdirSync(tempDir).forEach(typeFolder => {
                const src = path.join(tempDir, typeFolder);
                const dest = path.join(releaseFolder, typeFolder);
                if (fs.statSync(src).isDirectory()) {
                    fsExtra.copySync(src, dest, { overwrite: true });
                }
            });
        }

        // Copy SFDX
        const retrievedPath = path.join(sfdxTemp, 'retrieve-temp');
        const sfdxTarget = path.join(releaseFolder, 'sfdx', 'force-app', 'main', 'default');
        fsExtra.mkdirpSync(sfdxTarget);

        if (fs.existsSync(retrievedPath)) {
            fsExtra.copySync(retrievedPath, sfdxTarget, { overwrite: true });
        }

        fs.writeFileSync(path.join(releaseFolder, 'sfdx', 'sfdx-project.json'), JSON.stringify({
            packageDirectories: [{ path: 'force-app', default: true }],
            namespace: '',
            sourceApiVersion: '59.0'
        }, null, 2));

        const deployedBy = process.env.GIT_COMMIT_NAME || 'Omni Deployer';
        const flattenedComponents = flattenSelectedComponents(selectedComponents);

        const releaseMetadata = {
            releaseId,
            releaseName: releaseName || '',
            deployedAt,
            deployedAtFormatted,
            deployedBy,
            sourceAlias,
            components: flattenedComponents,
            gitBranch
        };

        //  Write to Git directory
        fs.writeFileSync(path.join(releaseFolder, 'release.json'), JSON.stringify(releaseMetadata, null, 2));

        const releaseHistoryDir = path.join(componentsDir, 'releases');
        fs.mkdirSync(releaseHistoryDir, { recursive: true });
        fs.writeFileSync(path.join(releaseHistoryDir, `${releaseId}.json`), JSON.stringify(releaseMetadata, null, 2));

        //  ALSO write to local storage directory for /releases route
        // const localReleaseDir = path.join(__dirname, 'storage', sourceAlias, 'releases');
        // fs.mkdirSync(localReleaseDir, { recursive: true });
        // fs.writeFileSync(path.join(localReleaseDir, `${releaseId}.json`), JSON.stringify(releaseMetadata, null, 2));
        
        const localReleaseDir = path.join(__dirname, 'storage', sourceAlias, 'releases');
        fs.mkdirSync(localReleaseDir, { recursive: true });
        const localPath = path.join(localReleaseDir, `${releaseId}.json`);
        fs.writeFileSync(localPath, JSON.stringify(releaseMetadata, null, 2));
        console.log(`Local release saved: ${localPath}`);
        

        // Timestamp marker
        const metaDir = path.join(componentsDir, '.meta');
        fsExtra.mkdirpSync(metaDir);
        const timestampFile = path.join(metaDir, `.last-deploy-${Date.now()}.txt`);
        fs.writeFileSync(timestampFile, 'Deployed at ' + deployedAt);

        // Git commit/tag
        const git = simpleGit(gitExportDir);
        await git.addConfig('user.email', process.env.GIT_COMMIT_EMAIL || 'omni-deploy@tgs.com');
        await git.addConfig('user.name', deployedBy);
        await git.checkout(gitBranch);
        await git.add('--all');

        const fullTagName = releaseFolderName;
        // await git.commit(`Release: ${fullTagName} — ${commitMessage}`);
        // await git.push('origin', gitBranch);
        // await git.addTag(fullTagName);
        // await git.pushTags('origin');

        await git.commit(`Release: ${fullTagName} — ${commitMessage}`);
        await git.push('origin', gitBranch);

        // Ensure safe re-tag if re-deploy
        const existingTags = await git.tags();
        if (existingTags.all.includes(fullTagName)) {
            console.log(`Tag already exists, deleting: ${fullTagName}`);
            await git.tag(['-d', fullTagName]);
            await git.push(['origin', `:refs/tags/${fullTagName}`]);
        }

        await git.addTag(fullTagName);
        await git.pushTags('origin');


        const pipelineData = await triggerGitlabPipeline();
        console.log(` pipelineData : ${pipelineData}`);

        return res.status(200).json({
            status: 'success',
            message: 'Selected OmniStudio + SFDX metadata exported to Git!',
            release: releaseMetadata,
            pipeline: {
                id: pipelineData.id,
                status: pipelineData.status,
                url: pipelineData.web_url,
                ref: pipelineData.ref,
                created_at: pipelineData.created_at
            }
        });

        // const pipelineData = await getLatestPipelineInfo(gitBranch);
        // console.log(` pipelineData : ${pipelineData}`);

        // return res.status(200).json({
        //     status: 'success',
        //     message: 'Selected OmniStudio + SFDX metadata exported to Git!',
        //     release: releaseMetadata,
        //       pipeline: pipelineData ? {
        //         id: pipelineData.id,
        //         status: pipelineData.status,
        //         url: pipelineData.web_url,
        //         ref: pipelineData.ref,
        //         created_at: pipelineData.created_at
        //     } : null
        // });

    } catch (err) {
        console.error('deploy-and-git error:', err.message || err);
        return res.status(500).json({
            status: 'error',
            message: err.message || 'Unexpected error during deploy-and-git'
        });
    }
});


app.post('/rollback', async (req, res) => {
    const { branch, commitId, sourceAlias = 'default', user = 'TGS DX Bot' } = req.body;

    if (!branch || !commitId) {
        return res.status(400).json({
            status: 'error',
            message: 'Missing required fields: branch and commitId'
        });
    }

    try {
        if (fs.existsSync(gitExportDir)) {
            fs.rmSync(gitExportDir, { recursive: true, force: true });
        }

        await simpleGit().clone(repoUrl, gitExportDir);
        const git = simpleGit(gitExportDir);
        await git.checkout(branch);
        await git.addConfig('user.email', 'dx-bot@tgs.com');
        await git.addConfig('user.name', user);

        // 🔍 Step 1: Get files affected by commit
        const diffOutput = await git.raw([
            'diff-tree',
            '--no-commit-id',
            '--name-status',
            '-r',
            commitId
        ]);

        const lines = diffOutput.trim().split('\n');
        if (lines.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: `No files found in commit ${commitId}`
            });
        }

        const filesToDelete = [];

        // 🧠 BACKUP before deletion
        const rollbackBackupDir = path.join(__dirname, 'storage', sourceAlias, 'rollback-backups', commitId);

        for (const line of lines) {
            const [status, filePath] = line.split('\t');
            if (['A', 'M'].includes(status)) {
                const fullPath = path.join(gitExportDir, filePath);
                if (fs.existsSync(fullPath)) {
                    // ✅ Backup this file
                    const backupPath = path.join(rollbackBackupDir, filePath);
                    fs.mkdirSync(path.dirname(backupPath), { recursive: true });
                    fs.copyFileSync(fullPath, backupPath);

                    // Then delete it
                    fs.unlinkSync(fullPath);
                    await git.rm(filePath);
                    filesToDelete.push(filePath);
                }
            }
        }

        if (filesToDelete.length === 0) {
            return res.status(400).json({
                status: 'error',
                message: 'No deletable files found for this commit.'
            });
        }

        // ✅ Dummy marker for rollback
        const marker = `.rollback-marker-${Date.now()}.txt`;
        fs.writeFileSync(path.join(gitExportDir, 'components', marker), `Rollback marker for ${commitId}`);
        await git.add('--all');

        await git.commit(`Rollback of commit ${commitId} - deleted added/modified files`);
        await git.push('origin', branch);

        // 📝 Save rollback record
        const rollbackRecord = {
            commitId,
            shortHash: commitId.substring(0, 8),
            branch,
            sourceAlias,
            rolledBackAt: new Date().toISOString(),
            rolledBackBy: user,
            deletedFiles: filesToDelete
        };

        const rollbackDir = path.join(__dirname, 'storage', sourceAlias);
        const rollbackFile = path.join(rollbackDir, 'rollback-history.json');
        fs.mkdirSync(rollbackDir, { recursive: true });

        let rollbackHistory = [];
        if (fs.existsSync(rollbackFile)) {
            rollbackHistory = JSON.parse(fs.readFileSync(rollbackFile, 'utf-8'));
        }

        rollbackHistory.unshift(rollbackRecord);
        fs.writeFileSync(rollbackFile, JSON.stringify(rollbackHistory, null, 2));

        return res.status(200).json({
            status: 'success',
            message: `Rollback of commit ${commitId} completed.`,
            rollback: rollbackRecord
        });

    } catch (err) {
        console.error('Rollback failed:', err.message || err);
        return res.status(500).json({
            status: 'error',
            message: err.message || 'Unexpected error during rollback'
        });
    }
});



app.post('/redeploy-rollback', async (req, res) => {
    const { branch, commitId, sourceAlias = 'default', user = 'TGS DX Bot' } = req.body;

    if (!branch || !commitId) {
        return res.status(400).json({
            status: 'error',
            message: 'Missing required fields: branch and commitId'
        });
    }

    try {
        const backupDir = path.join(__dirname, 'storage', sourceAlias, 'rollback-backups', commitId);
        if (!fs.existsSync(backupDir)) {
            return res.status(404).json({
                status: 'error',
                message: `Rollback backup folder missing for ${commitId}`
            });
        }

        // Clean previous export
        if (fs.existsSync(gitExportDir)) {
            fs.rmSync(gitExportDir, { recursive: true, force: true });
        }

        await simpleGit().clone(repoUrl, gitExportDir);
        const git = simpleGit(gitExportDir);
        await git.checkout(branch);

        await git.addConfig('user.email', 'dx-bot@tgs.com');
        await git.addConfig('user.name', user);

        // Copy files back from backup
        const redeployedFiles = [];

        const copyRecursive = (srcDir, destDir) => {
            const entries = fs.readdirSync(srcDir, { withFileTypes: true });
            for (const entry of entries) {
                const srcPath = path.join(srcDir, entry.name);
                const destPath = path.join(destDir, entry.name);
                if (entry.isDirectory()) {
                    fs.mkdirSync(destPath, { recursive: true });
                    copyRecursive(srcPath, destPath);
                } else {
                    fs.mkdirSync(path.dirname(destPath), { recursive: true });
                    fs.copyFileSync(srcPath, destPath);
                    const relPath = path.relative(gitExportDir, destPath);
                    redeployedFiles.push(relPath);
                }
            }
        };

        copyRecursive(backupDir, gitExportDir);

        // Dummy marker
        const marker = `.redeploy-marker-${Date.now()}.txt`;
        fs.writeFileSync(path.join(gitExportDir, 'components', marker), `Redeploy marker for ${commitId}`);
        await git.add('--all');
        await git.commit(`Redeploy rollback: Restored files from commit ${commitId}`);
        await git.push('origin', branch);

        return res.status(200).json({
            status: 'success',
            message: `Rollback ${commitId} redeployed.`,
            redeployedBy: user,
            redeployedFiles
        });

    } catch (err) {
        console.error('Redeploy failed:', err.message || err);
        return res.status(500).json({
            status: 'error',
            message: err.message || 'Unexpected error during redeploy'
        });
    }
});



app.get('/stored-components', async(req, res) => {
    const { sourceAlias } = req.query;
    console.log('/stored-components request received with sourceAlias:', sourceAlias);

    if (!sourceAlias) return res.status(400).send('sourceAlias is required');

    try {

        const index = storage.getIndex(sourceAlias);
        console.log('storage.getIndex(trial1):', JSON.stringify(index, null, 2));
        if (!index || typeof index !== 'object') {
            
            return res.status(404).send('No stored components found');
        }

    // if (!index || typeof index !== 'object' || Object.keys(index).length === 0) {
    //         console.log(`📥 Auto-fetching components for: ${sourceAlias}`);
    //        const index = await fetchAndStoreComponentsFromOrg(sourceAlias); // ✅ Now valid
    //     }


        const releasesPath = path.join(__dirname, 'storage', sourceAlias, 'releases');
        let latestRelease = null;

        if (fs.existsSync(releasesPath)) {
            const releaseFiles = fs.readdirSync(releasesPath).filter(f => f.endsWith('.json'));
            const sorted = releaseFiles
                .map(f => {
                    const release = JSON.parse(fs.readFileSync(path.join(releasesPath, f), 'utf-8'));
                    return {
                        file: f,
                        deployedAt: new Date(release.deployedAt),
                        data: release
                    };
                })
                .sort((a, b) => b.deployedAt - a.deployedAt);

            if (sorted.length > 0) {
                latestRelease = sorted[0].data;
            }
        }

        const groupedIndex = {};
        const deployedAt = latestRelease ? new Date(latestRelease.deployedAt) : null;

        for (const [type, components] of Object.entries(index)) {
            if (type === 'RegularMetadata') {
                groupedIndex.RegularMetadata = {};

                for (const [subtype, subComponents] of Object.entries(components)) {
                    if (!Array.isArray(subComponents)) continue;

                    const visibleSubItems = subComponents
                        .map(comp => {
                            const wasDeployed = latestRelease?.components?.RegularMetadata?.[subtype]?.includes(comp.name);

                            const rawDate = comp.lastModifiedDateFormatted || comp.lastModifiedDate || comp.lastModifiedDateTime;
                            let lastModified = null;
                            try {
                                lastModified = rawDate ? new Date(rawDate) : null;
                            } catch {
                                lastModified = null;
                            }

                            const isChanged = !wasDeployed || (lastModified && deployedAt && lastModified > deployedAt);

                            return {
                                ...comp,
                                wasPreviouslyDeployed: wasDeployed,
                                modifiedAfterDeployment: isChanged
                            };
                        })
                        .filter(c => !c.wasPreviouslyDeployed || c.modifiedAfterDeployment);

                    groupedIndex.RegularMetadata[subtype] = visibleSubItems;
                }

            } else {
                if (!Array.isArray(components)) {
                    console.warn(`Skipping type "${type}" — not an array`);
                    continue;
                }

                const visibleItems = components
                    .map(comp => {
                        const wasDeployed = latestRelease?.components?.[type]?.includes(comp.name);

                        const rawDate = comp.lastModifiedDateFormatted || comp.lastModifiedDate || comp.lastModifiedDateTime;
                        let lastModified = null;
                        try {
                            lastModified = rawDate ? new Date(rawDate) : null;
                        } catch {
                            lastModified = null;
                        }

                        const isChanged = !wasDeployed || (lastModified && deployedAt && lastModified > deployedAt);

                        return {
                            ...comp,
                            wasPreviouslyDeployed: wasDeployed,
                            modifiedAfterDeployment: isChanged
                        };
                    })
                    .filter(c => !c.wasPreviouslyDeployed || c.modifiedAfterDeployment);

                groupedIndex[type] = visibleItems;
            }
        }

        console.log('Deployed components in latestRelease:', JSON.stringify(latestRelease?.components, null, 2));
        console.log('Grouped Index keys returned:', Object.keys(groupedIndex));

        return res.json(groupedIndex);
    } catch (err) {
        console.error('Error in /stored-components:', err);
        return res.status(500).send('Internal server error');
    }
});

app.get('/refresh-components', async (req, res) => {
    const { sourceAlias } = req.query;
    if (!sourceAlias) return res.status(400).send('sourceAlias is required');

    try {
        // Step 1: Trigger the full refresh (fetch + filter + save)
        const refreshResponse = await axios.get(`http://localhost:3000/components`, {
            params: { sourceAlias }
        });

        console.log(`Refresh complete for ${sourceAlias}. Proceeding to load stored components.`);

        // Step 2: Now load filtered (only changed/new) components
        const storedResponse = await axios.get(`http://localhost:3000/stored-components`, {
            params: { sourceAlias }
        });

        return res.json(storedResponse.data);
    } catch (err) {
        console.error('Error in /refresh-components:', err.message);
        return res.status(500).json({ error: 'Refresh failed', details: err.message });
    }
});

app.get('/releases', (req, res) => {
    const { sourceAlias, branch } = req.query;
    if (!sourceAlias) return res.status(400).send('sourceAlias is required');

    const releasesDir = path.join(__dirname, 'storage', sourceAlias, 'releases');
    if (!fs.existsSync(releasesDir)) {
        return res.status(404).json({ message: 'No releases found' });
    }

    try {
        const allReleases = fs.readdirSync(releasesDir)
            .filter(f => f.endsWith('.json'))
            .map(file => {
                const filePath = path.join(releasesDir, file);
                const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                return {
                    releaseId: content.releaseId,
                    releaseName: content.releaseName || '',
                    deployedAt: content.deployedAt,
                    deployedAtFormatted: content.deployedAtFormatted,
                    deployedBy: content.deployedBy,
                    gitBranch: content.gitBranch || 'main',
                    components: content.components
                };
            });

        const filtered = branch
            ? allReleases.filter(r => r.gitBranch === branch)
            : allReleases;

        // Sort by newest first
        filtered.sort((a, b) => new Date(b.deployedAt) - new Date(a.deployedAt));

        // if (branch) {
        //     // Return flat list if branch is specified
        //     return res.json({
        //         status: 'success',
        //         sourceAlias,
        //         filterBranch: branch,
        //         count: filtered.length,
        //         releases: filtered
        //     });
        // } else {
        //     // Group by branch if no branch filter
        //     const grouped = {};
        //     for (const rel of filtered) {
        //         if (!grouped[rel.gitBranch]) grouped[rel.gitBranch] = [];
        //         grouped[rel.gitBranch].push(rel);
        //     }

        //     return res.json({
        //         status: 'success',
        //         sourceAlias,
        //         branches: Object.keys(grouped),
        //         releases: grouped
        //     });
        // }

        return res.json({
        status: 'success',
        sourceAlias,
        filterBranch: branch || null,
        count: filtered.length,
        releases: filtered
});

    } catch (err) {
        console.error('Error reading releases:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to read releases' });
    }
});

// app.post('/re-deploy-release', async (req, res) => {
//     const { sourceAlias, releaseId, overrideCommitMessage, overrideBranch } = req.body;

//     if (!sourceAlias || !releaseId) {
//         return res.status(400).json({ status: 'error', message: 'sourceAlias and releaseId are required' });
//     }

//     const releasePath = path.join(__dirname, 'storage', sourceAlias, 'releases', `${releaseId}.json`);

//     if (!fs.existsSync(releasePath)) {
//         return res.status(404).json({ status: 'error', message: 'Release not found' });
//     }

//     try {
//         const release = JSON.parse(fs.readFileSync(releasePath, 'utf-8'));

//         const payload = {
//             sourceAlias,
//             selectedComponents: release.components,
//             gitBranch: overrideBranch || release.gitBranch || 'main',
//             commitMessage: overrideCommitMessage || `Re-deploying ${release.releaseName || release.releaseId}`,
//             releaseName: `${release.releaseName || release.releaseId} (Redeploy)`
//         };

//         // Call /deploy-and-git internally
//         const axiosRes = await axios.post(`http://localhost:3000/deploy-and-git`, payload);
//         return res.status(200).json({
//             status: 'success',
//             originalRelease: releaseId,
//             newRelease: axiosRes.data.release,
//             pipeline: axiosRes.data.pipeline
//         });

//     } catch (err) {
//         console.error('Error during re-deploy:', err.message);
//         return res.status(500).json({ status: 'error', message: 'Failed to re-deploy release' });
//     }
// });

// app.get('/commits', async (req, res) => {
//     const branch = req.query.branch;
//     const gitExportDir = './git-export';
//     const repoUrl = process.env.GITLAB_REPO_URL;

//     if (!branch) {
//         return res.status(400).json({ status: 'error', message: 'Missing branch param' });
//     }

//     try {
//         if (fs.existsSync(gitExportDir)) {
//             fs.rmSync(gitExportDir, { recursive: true, force: true });
//         }

//         await simpleGit().clone(repoUrl, gitExportDir);
//         const git = simpleGit(gitExportDir);
//         await git.fetch();

//         const branches = await git.branch(['-a']);
//         const isLocal = Object.keys(branches.branches).includes(branch);
//         const remoteBranchName = `remotes/origin/${branch}`;
//         const isRemote = Object.keys(branches.branches).includes(remoteBranchName);

//         if (isLocal) {
//             await git.checkout(branch);
//         } else if (isRemote) {
//             await git.checkoutBranch(branch, remoteBranchName);
//         } else {
//             return res.status(404).json({
//                 status: 'error',
//                 message: `Branch '${branch}' not found in local or remote`
//             });
//         }

//         // Fetch large enough log to capture all rollbacks
//         const log = await git.log({ n: 100 });

//         const rolledBackShortHashes = new Set();

//         // First pass: collect rolled-back short hashes
//         for (const commit of log.all) {
//             const match = commit.message.match(/Rollback of commit (\w{7,40})/);
//             if (match) {
//                 rolledBackShortHashes.add(match[1]);
//             }
//         }
        

//         // Second pass: filter out commits whose full hash starts with any rolled-back short hash
//         const filteredCommits = log.all.filter(commit => {
//             return !Array.from(rolledBackShortHashes).some(shortHash =>
//                 commit.hash.startsWith(shortHash)
//             );
//         // }).map(commit => ({
//         //     hash: commit.hash,
//         //     shortHash: commit.hash.substring(0, 8),
//         //     message: commit.message,
//         //     author: commit.author_name,
//         //     date: commit.date
//         // }));

//         }).map(commit => {
//             const componentMatch = commit.message.match(/(?:Added|Updated|Removed)\s+(\w+):\s+([A-Za-z0-9_]+)/);
//             return {
//                 hash: commit.hash,
//                 shortHash: commit.hash.substring(0, 8),
//                 message: commit.message,
//                 body: commit.body,
//                 author: commit.author_name,
//                 email: commit.author_email,
//                 date: commit.date,
//                 relativeDate: timeAgo(commit.date),
//                 refs: commit.refs,
//                 parentHashes: commit.parentHashes,
//                 isRollback: /Rollback of commit (\w{7,40})/.test(commit.message),
//                 componentType: componentMatch ? componentMatch[1] : null,
//                 componentName: componentMatch ? componentMatch[2] : null
//             };
//         });
//         return res.status(200).json({
//             status: 'success',
//             branch,
//             commits: filteredCommits
//         });

//     } catch (err) {
//         console.error('Error fetching commits:', err.message || err);
//         return res.status(500).json({
//             status: 'error',
//             message: err.message || 'Failed to fetch commits'
//         });
//     }
// });


app.get('/components', async (req, res) => {
    const { sourceAlias } = req.query;
    if (!sourceAlias) return res.status(400).send('sourceAlias is required');

    const safeTypes = [
        'OmniScript', 'FlexCard', 'DataRaptor', 'IntegrationProcedure',
        'OmniStudioTrackingService', 'VlocityUILayout', 'VlocityUITemplate',
        'CalculationMatrix', 'CalculationProcedure'
    ];

    const regularMetadataTypes = [
        { name: 'ApexClass', members: ['*'] },
        { name: 'ApexTrigger', members: ['*'] },
        { name: 'LightningComponentBundle', members: ['*'] }
    ];

    const summary = {};
    const omniScriptKeyMap = {};

    // CLEAN STORAGE COMPONENT FOLDERS
    const storagePath = path.join(__dirname, 'storage', sourceAlias);
    for (const type of safeTypes) {
        const folder = path.join(storagePath, type);
        if (fs.existsSync(folder)) {
            fs.rmSync(folder, { recursive: true, force: true });
        }
    }
    const regTypes = ['ApexClass', 'ApexTrigger', 'LightningComponentBundle'];
    for (const regType of regTypes) {
        const folder = path.join(storagePath, 'RegularMetadata', regType);
        if (fs.existsSync(folder)) {
            fs.rmSync(folder, { recursive: true, force: true });
        }
    }

    // Read latest release info
    const releasesDir = path.join(__dirname, 'storage', sourceAlias, 'releases');
    let latestReleaseTime = null;
    let latestReleaseComponents = {};
    if (fs.existsSync(releasesDir)) {
        const releaseFiles = fs.readdirSync(releasesDir)
            .filter(f => f.endsWith('.json'))
            .map(f => path.join(releasesDir, f))
            .sort((a, b) => fs.statSync(b).mtime - fs.statSync(a).mtime);
        if (releaseFiles.length > 0) {
            const latestRelease = JSON.parse(fs.readFileSync(releaseFiles[0], 'utf-8'));
            latestReleaseTime = new Date(latestRelease.deployedAt);
            latestReleaseComponents = latestRelease.components || {};
        }
    }

    // Clean folders
    safeTypes.forEach(type => {
        const dirPath = path.join(__dirname, type);
        if (fs.existsSync(dirPath)) {
            fs.rmSync(dirPath, { recursive: true, force: true });
        }
    });

    const yamlContent = {
        export: {},
        exportPacks: {
            autoAddDependentFields: true,
            autoAddDependencies: true
        }
    };
    safeTypes.forEach(type => yamlContent.export[type] = {});
    fs.writeFileSync('exportAllOmni.yaml', require('js-yaml').dump(yamlContent));

    try {
        const exportCmd = `npx vlocity -sfdx.username ${sourceAlias} packExport -job exportAllOmni.yaml --all --ignoreAllErrors`;
        execSync(exportCmd, { encoding: 'utf-8', stdio: 'pipe' });

        for (const type of safeTypes) {
            const typeDir = path.join(__dirname, type);
            if (!fs.existsSync(typeDir)) continue;

            const entries = fs.readdirSync(typeDir).filter(entry =>
                fs.statSync(path.join(typeDir, entry)).isDirectory()
            );
            summary[type] = entries;

            for (const name of entries) {
                const jsonPath = path.join(typeDir, name, `${name}_DataPack.json`);
                if (!fs.existsSync(jsonPath)) continue;

                const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
                storage.saveComponentWithMetadata(sourceAlias, type, name, data);

                if (type === 'OmniScript') {
                    const isOmni = data?.OmniProcessType === 'OmniScript';
                    const omniName = data?.Name;
                    const lang = data?.Language;
                    const subType = data?.SubType;
                    const omniType = data?.Type;

                    if (isOmni && omniName && lang && subType && omniType) {
                        const key = `${omniType}_${subType}_${lang}`;
                        omniScriptKeyMap[key] = omniName;
                    }
                }
            }
        }
    } catch (err) {
        console.error('OmniStudio export failed:', err.message);
    }

    let accessToken, instanceUrl;
    try {
        const authInfo = JSON.parse(execSync(`sf org display --target-org ${sourceAlias} --json`, { encoding: 'utf-8' }));
        accessToken = authInfo.result.accessToken;
        instanceUrl = authInfo.result.instanceUrl;
    } catch (err) {
        console.error('Auth error:', err.message);
    }

    try {
        for (const type of safeTypes) {
            if (summary[type] && summary[type].length > 0) {
                const timestampMap = (type === 'OmniScript')
                    ? await storage.fetchOmniComponentDates(instanceUrl, accessToken, type, summary[type], omniScriptKeyMap)
                    : await storage.fetchOmniComponentDates(instanceUrl, accessToken, type, summary[type]);

                summary[type] = summary[type].map(name => {
                    const raw = timestampMap[name] || {};
                    const modDate = raw.lastModifiedDate ? new Date(raw.lastModifiedDate) : null;

                    const wasDeployed = latestReleaseComponents[type]?.includes(name);
                    const modifiedAfterDeployment = modDate && latestReleaseTime ? modDate > latestReleaseTime : true;
                    const include = !wasDeployed || modifiedAfterDeployment;

                    const formatted = {
                        name,
                        type,
                        createdDate: raw.createdDate,
                        lastModifiedDate: raw.lastModifiedDate,
                        createdDateFormatted: formatDate(raw.createdDate),
                        lastModifiedDateFormatted: formatDate(raw.lastModifiedDate),
                        wasPreviouslyDeployed: wasDeployed,
                        modifiedAfterDeployment
                    };

                    if (include) {
                        storage.saveComponentWithMetadata(sourceAlias, type, name, formatted);
                        return formatted;
                    }
                    return null;
                }).filter(Boolean);
            }
        }
    } catch (err) {
        console.warn('Failed to fetch OmniStudio component dates:', err.message);
    }

    // REGULAR METADATA
    const retrieveTempDir = path.join(__dirname, 'retrieved-metadata');
    const outputPath = path.join(__dirname, 'sf-output');
    fs.rmSync(retrieveTempDir, { recursive: true, force: true });
    fs.rmSync(outputPath, { recursive: true, force: true });
    fs.mkdirSync(path.join(retrieveTempDir, 'force-app'), { recursive: true });
    fs.mkdirSync(outputPath, { recursive: true });

    fs.writeFileSync(
        path.join(retrieveTempDir, 'sfdx-project.json'),
        JSON.stringify({
            packageDirectories: [{ path: 'force-app', default: true }],
            namespace: '',
            sourceApiVersion: '59.0'
        }, null, 2)
    );

    fs.writeFileSync(
        path.join(retrieveTempDir, 'package.xml'),
        xmlBuilder.create({ Package: { types: regularMetadataTypes, version: '59.0' } }).end({ pretty: true })
    );

    const categorized = {
        ApexClass: [],
        ApexTrigger: [],
        LightningComponentBundle: []
    };

    try {
        const retrieveCmd = `sf project retrieve start --manifest package.xml --target-org ${sourceAlias} --output-dir ${outputPath}`;
        execSync(retrieveCmd, { cwd: retrieveTempDir, encoding: 'utf-8' });

        const regularFiles = fs.readdirSync(outputPath, { withFileTypes: true })
            .flatMap(entry => {
                const subDir = path.join(outputPath, entry.name);
                return entry.isDirectory()
                    ? fs.readdirSync(subDir).map(f => `${entry.name}/${f}`)
                    : [entry.name];
            });

        regularFiles.forEach(filePath => {
            if (filePath.startsWith('classes/') && filePath.endsWith('.cls')) {
                const name = path.basename(filePath, '.cls');
                categorized.ApexClass.push(name);
            } else if (filePath.startsWith('triggers/') && filePath.endsWith('.trigger')) {
                const name = path.basename(filePath, '.trigger');
                categorized.ApexTrigger.push(name);
            } else if (filePath.startsWith('lwc/')) {
                const name = filePath.split('/')[1];
                categorized.LightningComponentBundle.push(name);
            }
        });

        const allTimestamps = {};
        for (const [metaType, components] of Object.entries(categorized)) {
            if (components.length > 0) {
                const ts = await storage.fetchMetadataDatesFromSalesforce(instanceUrl, accessToken, metaType, components);
                allTimestamps[metaType] = ts;
            }
        }

        summary['RegularMetadata'] = {};
        Object.entries(categorized).forEach(([metaType, components]) => {
            summary['RegularMetadata'][metaType] = components.map(name => {
                const raw = (allTimestamps[metaType] && allTimestamps[metaType][name]) || {};
                const modDate = raw.lastModifiedDate ? new Date(raw.lastModifiedDate) : null;

                const wasDeployed = (latestReleaseComponents['RegularMetadata']?.[metaType] || []).includes(name);
                const modifiedAfterDeployment = modDate && latestReleaseTime ? modDate > latestReleaseTime : true;
                const include = !wasDeployed || modifiedAfterDeployment;

                const formatted = {
                    name,
                    type: metaType,
                    ...raw,
                    wasPreviouslyDeployed: wasDeployed,
                    modifiedAfterDeployment
                };

                if (include) {
                    storage.saveComponentWithMetadata(sourceAlias, path.join('RegularMetadata', metaType), name, formatted);

                    // ✅ COPY .cls/.trigger/.js FILES FOR ANALYSIS
                    const baseExportPath = path.join(outputPath, metaType === 'ApexTrigger' ? 'triggers' : (metaType === 'ApexClass' ? 'classes' : 'lwc'));

                    if (metaType === 'ApexClass') {
                        const src = path.join(baseExportPath, `${name}.cls`);
                        const dest = path.join(__dirname, 'storage', sourceAlias, 'RegularMetadata', 'classes', `${name}.cls`);
                        if (fs.existsSync(src)) {
                            fs.mkdirSync(path.dirname(dest), { recursive: true });
                            fs.copyFileSync(src, dest);
                        }
                    } else if (metaType === 'ApexTrigger') {
                        const src = path.join(baseExportPath, `${name}.trigger`);
                        const dest = path.join(__dirname, 'storage', sourceAlias, 'RegularMetadata', 'triggers', `${name}.trigger`);
                        if (fs.existsSync(src)) {
                            fs.mkdirSync(path.dirname(dest), { recursive: true });
                            fs.copyFileSync(src, dest);
                        }
                    } else if (metaType === 'LightningComponentBundle') {
                        const src = path.join(baseExportPath, name, `${name}.js`);
                        const dest = path.join(__dirname, 'storage', sourceAlias, 'RegularMetadata', 'lwc', `${name}.js`);
                        if (fs.existsSync(src)) {
                            fs.mkdirSync(path.dirname(dest), { recursive: true });
                            fs.copyFileSync(src, dest);
                        }
                    }

                    return formatted;
                }
                return null;
            }).filter(Boolean);
        });

    } catch (err) {
        console.warn('Failed to retrieve regular metadata:', err.message);
        summary['RegularMetadata'] = [`Failed: ${err.message}`];
    }

    summary.timestamp = new Date().toISOString();
    summary.sourceAlias = sourceAlias;
    storage.saveIndex(sourceAlias, summary);
    return res.json(summary);
});

/**correct one for apex clas */
app.post('/analyze-class', async (req, res) => {
  let { className, sourceAlias } = req.body;

  if (!className || !sourceAlias) {
    return res.status(400).json({ status: 'error', message: 'Missing className or sourceAlias' });
  }

  className = className.replace(/\.cls$/i, '');

  try {
    // Authenticate and get org info
    const authInfo = JSON.parse(execSync(`sf org display --target-org ${sourceAlias} --json`, { encoding: 'utf8' }));
    const accessToken = authInfo.result.accessToken;
    const instanceUrl = authInfo.result.instanceUrl;

    // Fetch Apex class body
    const query = `SELECT Body FROM ApexClass WHERE Name = '${className}'`;
    const queryUrl = `${instanceUrl}/services/data/v59.0/tooling/query?q=${encodeURIComponent(query)}`;
    const headers = { Authorization: `Bearer ${accessToken}` };
    const response = await axios.get(queryUrl, { headers });

    if (!response.data.records || response.data.records.length === 0) {
      return res.status(404).json({ status: 'error', message: `Apex class ${className} not found.` });
    }

    const code = response.data.records[0].Body;

    // Return the code and metadata
    return res.json({
      status: 'success',
      className,
      fileName: `classes/${className}.cls`,
      type: 'ApexClass',
      sourceAlias,
      code
    });

  } catch (err) {
    console.error('Fetch Apex class error:', err.message || err);
    return res.status(500).json({
      status: 'error',
      message: err.message || 'Failed to fetch Apex class'
    });
  }
});

app.post('/coverage', async (req, res) => {
  let { sourceAlias, className = '*' } = req.body;
  if (!sourceAlias) {
    return res.status(400).json({ status: 'error', message: 'sourceAlias is required' });
  }

  // 1️Authenticate & grab token/instance
  let accessToken, instanceUrl;
  try {
    const info = JSON.parse(
      execSync(`sf org display --target-org ${sourceAlias} --json`, { encoding: 'utf8' })
    );
    accessToken = info.result.accessToken;
    instanceUrl = info.result.instanceUrl;
  } catch (err) {
    console.error('Auth error:', err.message);
    return res.status(500).json({ status: 'error', message: 'sf org display failed' });
  }

  // Build SOQL
  const whereClause =
    className === '*' ? '' :
    ` WHERE ApexClassOrTrigger.Name = '${className.replace(/'/g, "\\'")}'`;

  const soql = `
    SELECT ApexClassOrTrigger.Name,
           NumLinesCovered,
           NumLinesUncovered
      FROM ApexCodeCoverageAggregate${whereClause}`.trim();

  // Call Tooling API
  try {
    const resp = await axios.get(
      `${instanceUrl}/services/data/v60.0/tooling/query?q=${encodeURIComponent(soql)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const results = resp.data.records.map(r => {
      const covered = r.NumLinesCovered || 0;
      const uncovered = r.NumLinesUncovered || 0;
      const pct = covered + uncovered === 0 ? 0 : (covered / (covered + uncovered) * 100).toFixed(2);
      return {
        className : r.ApexClassOrTrigger.Name,
        numLinesCovered   : covered,
        numLinesUncovered : uncovered,
        coveragePercent   : Number(pct)
      };
    });

    return res.json({
      status : 'success',
      sourceAlias,
      scope  : className === '*' ? 'all' : 'single',
      count  : results.length,
      results
    });
  } catch (err) {
    console.error('Coverage query failed:', err.response?.data || err.message);
    return res.status(500).json({ status: 'error', message: 'Tooling API query failed' });
  }
});

app.post('/test-methods', async (req, res) => {
  let { sourceAlias, className = '*' } = req.body;

  if (!sourceAlias) {
    return res.status(400).json({ status: 'error', message: 'sourceAlias is required' });
  }

  /* 1️⃣  Authenticate & get access token / instance URL */
  let accessToken, instanceUrl;
  try {
    const info = JSON.parse(
      execSync(`sf org display --target-org ${sourceAlias} --json`, { encoding: 'utf8' })
    );
    accessToken = info.result.accessToken;
    instanceUrl = info.result.instanceUrl;
  } catch (err) {
    console.error('Auth error:', err.message || err);
    return res.status(500).json({ status: 'error', message: 'sf org display failed' });
  }

  /* 2️⃣  Build SOQL safely */
  const base = `SELECT ApexClass.Name, MethodName, Outcome, RunTime, TestTimestamp, Message, StackTrace FROM ApexTestResult`;
  const whereClause =
    className && className !== '*'
      ? ` WHERE ApexClass.Name = '${className.replace(/'/g, "\\'")}'`
      : '';
  const soql = `${base}${whereClause} ORDER BY TestTimestamp DESC`;

  /* 3️⃣  Call Tooling API */
  try {
    const resp = await axios.get(
      `${instanceUrl}/services/data/v60.0/tooling/query?q=${encodeURIComponent(soql)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const results = resp.data.records.map(r => ({
      className   : r.ApexClass.Name,
      methodName  : r.MethodName,
      outcome     : r.Outcome,
      runTime     : r.RunTime,
      timeStamp   : r.TestTimestamp,
      message     : r.Message,
      stackTrace  : r.StackTrace
    }));

    return res.json({
      status         : 'success',
      sourceAlias,
      classNameScope : className === '*' ? 'ALL' : className,
      count          : results.length,
      results
    });
  } catch (err) {
    console.error('Query failed:', err.response?.data || err.message || err);
    return res.status(500).json({
      status  : 'error',
      message : 'Tooling API or test execution failed',
      error   : err.response?.data || err.message
    });
  }
});

// app.post('/re-deploy-release', async (req, res) => {
//   const {
//     sourceAlias,
//     releaseId,
//     additionalComponents = {},
//     overrideCommitMessage,
//     overrideBranch
//   } = req.body;

//   if (!sourceAlias || !releaseId) {
//     return res.status(400).json({
//       status: 'error',
//       message: 'sourceAlias and releaseId are required'
//     });
//   }

//   const releasePath = path.join(__dirname, 'storage', sourceAlias, 'releases', `${releaseId}.json`);

//   if (!fs.existsSync(releasePath)) {
//     return res.status(404).json({
//       status: 'error',
//       message: `Release '${releaseId}' not found`
//     });
//   }

//   try {
//     const release = JSON.parse(fs.readFileSync(releasePath, 'utf-8'));

//     // Merge with new components
//     const mergedComponents = mergeSelectedComponents(release.components, additionalComponents);

//     // Overwrite same release name and ID
//     const now = new Date();
//     const deployedAt = now.toISOString();
//     const deployedAtFormatted = now.toLocaleString('en-IN', {
//       weekday: 'long',
//       year: 'numeric',
//       month: 'short',
//       day: 'numeric',
//       hour: '2-digit',
//       minute: '2-digit',
//       hour12: true,
//       timeZone: 'Asia/Kolkata',
//       timeZoneName: 'short'
//     });

//     const newMetadata = {
//       releaseId,
//       releaseName: release.releaseName,
//       deployedAt,
//       deployedAtFormatted,
//       deployedBy: process.env.GIT_COMMIT_NAME || 'Omni Deployer',
//       sourceAlias,
//       components: mergedComponents,
//       gitBranch: overrideBranch || release.gitBranch || 'main'
//     };

//     const payload = {
//       sourceAlias,
//       selectedComponents: mergedComponents,
//       gitBranch: newMetadata.gitBranch,
//       commitMessage: overrideCommitMessage || `Re-releasing ${release.releaseName || releaseId}`,
//       releaseName: newMetadata.releaseName,
//       releaseId 
//     };

//     if (fs.existsSync('./git-export')) {
//     fs.rmSync('./git-export', { recursive: true, force: true });
//     }

//     // Deploy via original endpoint
//     const axiosRes = await axios.post('http://localhost:3000/deploy-and-git', payload);

//     // Overwrite tag if needed (delete + recreate)


//     const gitExportDir = './git-export';
//     const git = simpleGit(gitExportDir);
//     await git.fetch();
//     // await git.tag(['-d', releaseId]); // delete local

//     await git.fetch('--tags');

//     // Only delete tag if it exists
//     const tags = await git.tags();
//     if (tags.all.includes(releaseId)) {
//     await git.tag(['-d', releaseId]); // delete local
//     await git.push(['origin', `:refs/tags/${releaseId}`]); // delete remote
//     }

//     // await git.push(['origin', `:refs/tags/${releaseId}`]); // delete remote
//     await git.addTag(releaseId);
//     await git.pushTags('origin');

//     // Overwrite `release.json` with updated metadata
//     const componentsDir = path.join(gitExportDir, 'components');
//     const releaseFolder = path.join(componentsDir, releaseId);
//     const releaseFile = path.join(releaseFolder, 'release.json');
//     const storageReleaseFile = path.join(__dirname, 'storage', sourceAlias, 'releases', `${releaseId}.json`);

//     fs.writeFileSync(releaseFile, JSON.stringify(newMetadata, null, 2));
//     fs.writeFileSync(storageReleaseFile, JSON.stringify(newMetadata, null, 2));

//     return res.status(200).json({
//       status: 'success',
//       originalRelease: releaseId,
//       newRelease: newMetadata,
//       pipeline: axiosRes.data.pipeline
//     });
//   } catch (err) {
//     console.error('Error during re-deploy:', err.message || err);
//     return res.status(500).json({
//       status: 'error',
//       message: 'Failed to re-deploy release',
//       details: err.message
//     });
//   }
// });


/**working now**/
app.post('/re-deploy-release', async (req, res) => {
const {
sourceAlias,
releaseId,
additionalComponents = {},
overrideCommitMessage,
overrideBranch
} = req.body;

  if (!sourceAlias || !releaseId) {
    return res.status(400).json({
      status: 'error',
      message: 'sourceAlias and releaseId are required'
    });
  }

  const releasePath = path.join(__dirname, 'storage', sourceAlias, 'releases', `${releaseId}.json`);

  if (!fs.existsSync(releasePath)) {
    return res.status(404).json({
      status: 'error',
      message: `Release '${releaseId}' not found`
    });
  }

  try {
    const release = JSON.parse(fs.readFileSync(releasePath, 'utf-8'));

    // Merge with new components
    const mergedComponents = mergeSelectedComponents(release.components, additionalComponents);

    // Overwrite same release name and ID
    const now = new Date();
    const deployedAt = now.toISOString();
    const deployedAtFormatted = now.toLocaleString('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata',
      timeZoneName: 'short'
    });

    const newMetadata = {
      releaseId,
      releaseName: release.releaseName,
      deployedAt,
      deployedAtFormatted,
      deployedBy: process.env.GIT_COMMIT_NAME || 'Omni Deployer',
      sourceAlias,
      components: mergedComponents,
      gitBranch: overrideBranch || release.gitBranch || 'main'
    };

    const payload = {
      sourceAlias,
      selectedComponents: mergedComponents,
      gitBranch: newMetadata.gitBranch,
      commitMessage: overrideCommitMessage || `Re-releasing ${release.releaseName || releaseId}`,
      releaseName: newMetadata.releaseName,
      releaseId 
    };

    if (fs.existsSync('./git-export')) {
    fs.rmSync('./git-export', { recursive: true, force: true });
    }

    // Deploy via original endpoint
    const axiosRes = await axios.post('http://localhost:3000/deploy-and-git', payload);

    // Overwrite tag if needed (delete + recreate)


    const gitExportDir = './git-export';
    const git = simpleGit(gitExportDir);
    await git.fetch();
    // await git.tag(['-d', releaseId]); // delete local

    await git.fetch('--tags');

    // Only delete tag if it exists
    const tags = await git.tags();
    if (tags.all.includes(releaseId)) {
    await git.tag(['-d', releaseId]); // delete local
    await git.push(['origin', `:refs/tags/${releaseId}`]); // delete remote
    }

    // await git.push(['origin', `:refs/tags/${releaseId}`]); // delete remote
    await git.addTag(releaseId);
    await git.pushTags('origin');

    // Overwrite `release.json` with updated metadata
    const componentsDir = path.join(gitExportDir, 'components');
    const releaseFolder = path.join(componentsDir, releaseId);
    const releaseFile = path.join(releaseFolder, 'release.json');
    const storageReleaseFile = path.join(__dirname, 'storage', sourceAlias, 'releases', `${releaseId}.json`);

    fs.writeFileSync(releaseFile, JSON.stringify(newMetadata, null, 2));
    fs.writeFileSync(storageReleaseFile, JSON.stringify(newMetadata, null, 2));

    return res.status(200).json({
      status: 'success',
      originalRelease: releaseId,
      newRelease: newMetadata,
      pipeline: axiosRes.data.pipeline
    });
  } catch (err) {
    console.error('Error during re-deploy:', err.message || err);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to re-deploy release',
      details: err.message
    });
  }
});



app.get('/commits', async (req, res) => {
    const branch = req.query.branch;
    const gitExportDir = './git-export';
    const repoUrl = process.env.GITLAB_REPO_URL;

    if (!branch) {
        return res.status(400).json({ status: 'error', message: 'Missing branch param' });
    }

    try {
        if (fs.existsSync(gitExportDir)) {
            fs.rmSync(gitExportDir, { recursive: true, force: true });
        }

        await simpleGit().clone(repoUrl, gitExportDir);
        const git = simpleGit(gitExportDir);
        await git.fetch();

        const branches = await git.branch(['-a']);
        const isLocal = Object.keys(branches.branches).includes(branch);
        const remoteBranchName = `remotes/origin/${branch}`;
        const isRemote = Object.keys(branches.branches).includes(remoteBranchName);

        if (isLocal) {
            await git.checkout(branch);
        } else if (isRemote) {
            await git.checkoutBranch(branch, remoteBranchName);
        } else {
            return res.status(404).json({
                status: 'error',
                message: `Branch '${branch}' not found in local or remote`
            });
        }

        const log = await git.log({ n: 100 });

        const rolledBackShortHashes = new Set();

        // Collect rolled-back short hashes
        for (const commit of log.all) {
            const match = commit.message.match(/Rollback of commit (\w{7,40})/);
            if (match) {
                rolledBackShortHashes.add(match[1]);
            }
        }

        // Filter out rollback commits
        const filteredCommits = log.all.filter(commit => {
            return !Array.from(rolledBackShortHashes).some(shortHash =>
                commit.hash.startsWith(shortHash)
            );
        });

        // Process commits and extract component info
        const commitsWithComponents = [];

        for (const commit of filteredCommits) {
            const showOutput = await git.show([commit.hash, '--name-only']);
            const filesChanged = showOutput
                .split('\n')
                .filter(line => line.trim() && !line.startsWith('commit'));

                const inferredComponents = inferComponentDetails(filesChanged)
                 .filter(c => c.type !== 'Unknown'); // ⬅Filtering unknowns

            // const inferredComponents = inferComponentDetails(filesChanged);

            commitsWithComponents.push({
                hash: commit.hash,
                shortHash: commit.hash.substring(0, 8),
                message: commit.message,
                body: commit.body,
                author: commit.author_name,
                email: commit.author_email,
                date: commit.date,
                relativeDate: timeAgo(commit.date),
                refs: commit.refs,
                parentHashes: commit.parentHashes,
                isRollback: /Rollback of commit (\w{7,40})/.test(commit.message),
                components: inferredComponents
            });
        }

        return res.status(200).json({
            status: 'success',
            branch,
            commits: commitsWithComponents
        });

    } catch (err) {
        console.error('Error fetching commits:', err.message || err);
        return res.status(500).json({
            status: 'error',
            message: err.message || 'Failed to fetch commits'
        });
    }
});



/**
 * ===============================================
 * Deploy Git Release → Sandbox
 * ===============================================
 */





// --- FULLY FIXED: Deploy a Git "release" to a target sandbox/org ---
// helper
const toPosix = p => p.replace(/\\/g, '/');

app.post('/deploy-to-sandbox', async (req, res) => {
  const { targetAlias, releaseId } = req.body;

  if (!targetAlias || !releaseId) {
    return res.status(400).json({
      status: 'error',
      message: 'targetAlias and releaseId are required'
    });
  }

  const repoUrl = process.env.GITLAB_REPO_URL;
  const gitExportDir = './git-export';
  const releasePath = path.join(gitExportDir, 'components', releaseId);
  const releaseMetaPath = path.join(releasePath, 'release.json');

  let omniDeployed = false;
  let regularDeployed = false;

  try {
    // 1) Fresh clone
    if (!repoUrl) throw new Error('GITLAB_REPO_URL is not set');
    if (fs.existsSync(gitExportDir)) fs.rmSync(gitExportDir, { recursive: true, force: true });
    await simpleGit().clone(repoUrl, gitExportDir);

    if (!fs.existsSync(releaseMetaPath)) {
      return res.status(404).json({
        status: 'error',
        message: `release.json not found for release '${releaseId}'`
      });
    }

    // 2) JWT auth target org
    await authenticateWithJWT(
      targetAlias,
      process.env.TARGET_CLIENT_ID,
      process.env.TARGET_USERNAME,
      process.env.TARGET_LOGIN_URL,
      process.env.TARGET_JWT_KEY
    );

    // 3) Read release metadata
    const releaseMeta = JSON.parse(fs.readFileSync(releaseMetaPath, 'utf-8'));

    // 4) Build Omni job file (always write, even if empty)
    const omniYaml = { export: {}, exportPacks: { autoAddDependencies: true, autoAddDependentFields: true } };
    for (const [type, comps] of Object.entries(releaseMeta.components || {})) {
      if (type === 'RegularMetadata') continue; // Regular handled below
      if (!Array.isArray(comps) || comps.length === 0) continue;
      omniYaml.export[type] = {};
      comps.forEach(name => { omniYaml.export[type][name] = {}; });
    }

    const jobPath = path.join(releasePath, 'deployFromGit.yaml');
    fs.writeFileSync(jobPath, yaml.dump(omniYaml));

    // 5) Omni deploy (only if components exist)
    if (Object.keys(omniYaml.export).length > 0) {
      const cmd = `npx vlocity packDeploy -sfdx.username ${targetAlias} -job "./deployFromGit.yaml" --projectPath "." --ignoreAllErrors --verbose`;
      console.log('▶ Omni Deploy:', cmd, '\n  cwd =', releasePath);
      execSync(cmd, { cwd: releasePath, stdio: 'inherit', shell: true });
      omniDeployed = true;
    } else {
      console.log('ℹ No Omni components found; skipping Omni deploy.');
    }

    // 6) Deploy Regular Metadata (always via MDAPI)
    const sfdxPath = path.join(releasePath, 'sfdx');
    if (fs.existsSync(sfdxPath)) {
    const mdapiOut = path.join(releasePath, 'mdapi');
    if (fs.existsSync(mdapiOut)) fs.rmSync(mdapiOut, { recursive: true, force: true });

    try {
        const convertCmd = `sf project convert source --root-dir "${toPosix(sfdxPath)}" --output-dir "${toPosix(mdapiOut)}"`;
        console.log('▶ Convert to MDAPI:', convertCmd);
        execSync(convertCmd, { stdio: 'inherit', shell: true });

        // sanity check: did conversion actually create a package?
        const pkgXml = path.join(mdapiOut, 'package.xml');
        if (!fs.existsSync(pkgXml)) {
        throw new Error(`MDAPI conversion produced no package.xml at ${pkgXml} — nothing to deploy.`);
        }

        const deployMdapiCmd = `sf deploy metadata --metadata-dir "${toPosix(mdapiOut)}" --target-org ${targetAlias}`;
        console.log('▶ MDAPI Deploy:', deployMdapiCmd);
        execSync(deployMdapiCmd, { stdio: 'inherit', shell: true });

        console.log('✅ Regular metadata deployed via MDAPI');
    } catch (e) {
        console.error('❌ Regular metadata deploy failed:', e?.message || e);
        throw e; // bubble up to your main catch (so it logs into release.json and returns 500)
    }
    } else {
    console.log('ℹ No SFDX folder found; skipping Regular metadata deploy.');
    }


    // 7) Log success
    if (!Array.isArray(releaseMeta.deployments)) releaseMeta.deployments = [];
    releaseMeta.deployments.push({
      targetAlias,
      deployedAt: new Date().toISOString(),
      status: 'success',
      details: `Deployed to ${targetAlias} | Omni:${omniDeployed ? 'yes' : 'no'} | Regular:${regularDeployed ? 'yes' : 'no'}`
    });
    fs.writeFileSync(releaseMetaPath, JSON.stringify(releaseMeta, null, 2));

    return res.status(200).json({
      status: 'success',
      message: `Release '${releaseId}' deployed to ${targetAlias}`,
      omniDeployed,
      regularDeployed
    });

  } catch (err) {
    console.error('deploy-to-sandbox failed:', err?.stack || err);

    // best-effort: append error to release.json
    try {
      if (fs.existsSync(releaseMetaPath)) {
        const meta = JSON.parse(fs.readFileSync(releaseMetaPath, 'utf-8'));
        if (!Array.isArray(meta.deployments)) meta.deployments = [];
        meta.deployments.push({
          targetAlias,
          deployedAt: new Date().toISOString(),
          status: 'error',
          details: err.message || String(err)
        });
        fs.writeFileSync(releaseMetaPath, JSON.stringify(meta, null, 2));
      }
    } catch {}

    return res.status(500).json({
      status: 'error',
      message: err.message || 'Deployment failed'
    });
  }
});



/**
 * ===============================================
 * Diff Git Release vs Sandbox
 * ===============================================
 */
app.post('/diff-release', async (req, res) => {
  const { targetAlias, releaseId } = req.body;

  if (!targetAlias || !releaseId) {
    return res.status(400).json({
      status: 'error',
      message: 'targetAlias and releaseId are required'
    });
  }

  const gitExportDir = './git-export';
  const releasePath = path.join(gitExportDir, 'components', releaseId);
  const releaseMetaPath = path.join(releasePath, 'release.json');

  try {
    // Clone repo fresh
    if (fs.existsSync(gitExportDir)) fs.rmSync(gitExportDir, { recursive: true, force: true });
    await simpleGit().clone(process.env.GITLAB_REPO_URL, gitExportDir);

    if (!fs.existsSync(releaseMetaPath)) {
      return res.status(404).json({
        status: 'error',
        message: `release.json not found for '${releaseId}'`
      });
    }

    // Read release metadata
    const releaseMeta = JSON.parse(fs.readFileSync(releaseMetaPath, 'utf-8'));

    // Compare components (using your storageHelper.diffComponents)
    const diffs = await diffComponents(targetAlias, releaseMeta.components);

    return res.status(200).json({
      status: 'success',
      releaseId,
      diffs
    });
  } catch (err) {
    console.error('diff-release failed:', err.message);
    return res.status(500).json({
      status: 'error',
      message: err.message || 'Diff failed'
    });
  }
});


/**
 * ===============================================
 * Release History (where deployed)
 * ===============================================
 */
app.get('/release-history', async (req, res) => {
  const { releaseId } = req.query;

  if (!releaseId) {
    return res.status(400).json({
      status: 'error',
      message: 'releaseId is required'
    });
  }

  const gitExportDir = './git-export';
  const releaseMetaPath = path.join(gitExportDir, 'components', releaseId, 'release.json');

  try {
    // Clone repo fresh
    if (fs.existsSync(gitExportDir)) fs.rmSync(gitExportDir, { recursive: true, force: true });
    await simpleGit().clone(process.env.GITLAB_REPO_URL, gitExportDir);

    if (!fs.existsSync(releaseMetaPath)) {
      return res.status(404).json({
        status: 'error',
        message: `release.json not found for '${releaseId}'`
      });
    }

    const releaseMeta = JSON.parse(fs.readFileSync(releaseMetaPath, 'utf-8'));

    return res.status(200).json({
      status: 'success',
      releaseId,
      deployments: releaseMeta.deployments || []
    });
  } catch (err) {
    console.error('release-history failed:', err.message);
    return res.status(500).json({
      status: 'error',
      message: err.message || 'Failed to fetch release history'
    });
  }
});


// Start server
app.listen(3000, () => {
    console.log('Deployment API running at http://localhost:3000');
});
