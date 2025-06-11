require('dotenv').config();

const express = require('express');
const { exec, execSync } = require('child_process');
const { authenticateWithJWT } = require('./authHelper');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const storage = require('./storageHelper');
const axios = require('axios');


// const stripAnsi = require('strip-ansi');

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

// GET: Export and store OmniStudio components
// app.get('/components', (req, res) => {
//     const { sourceAlias } = req.query;
//     if (!sourceAlias) return res.status(400).send('sourceAlias is required');

//     const yamlContent = {
//         export: {},
//         exportPacks: {
//             autoAddDependentFields: true,
//             autoAddDependencies: true
//         }
//     };

//     allTypes.forEach(type => {
//         yamlContent.export[type] = {};
//     });

//     fs.writeFileSync('exportAllOmni.yaml', yaml.dump(yamlContent));

//     const exportCmd = `npx vlocity -sfdx.username ${sourceAlias} packExport -job exportAllOmni.yaml --all --ignoreAllErrors`;
//     console.log(`Exporting with command: ${exportCmd}`);

//     exec(exportCmd, (err, stdout, stderr) => {
//         console.log('Export STDOUT:\n', stdout);
//         console.error('Export STDERR:\n', stderr);

//         if (err) return res.status(500).send('Export failed');

//         const summary = {
//             timestamp: new Date().toISOString(),
//             sourceAlias
//         };

//         allTypes.forEach(type => {
//             const dir = `./${type}`;
//             if (fs.existsSync(dir)) {
//                 const entries = fs.readdirSync(dir).filter(entry =>
//                     fs.statSync(path.join(dir, entry)).isDirectory()
//                 );

//                 summary[type] = entries;

//                 entries.forEach(name => {
//                     const jsonPath = path.join(dir, name, `${name}_DataPack.json`);
//                     if (fs.existsSync(jsonPath)) {
//                         const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
//                         storage.saveComponent(sourceAlias, type, name, data);
//                     }
//                 });
//             }
//         });

//         storage.saveIndex(sourceAlias, summary);
//         res.json(summary);
//     });
// });

app.get('/components', (req, res) => {
    const { sourceAlias } = req.query;
    if (!sourceAlias) return res.status(400).send('sourceAlias is required');

    const safeTypes = [
        'OmniScript',
        'FlexCard',
        'DataRaptor',
        'IntegrationProcedure',
        'OmniStudioTrackingService',
        'VlocityUILayout',
        'VlocityUITemplate',
        'CalculationMatrix',
        'CalculationProcedure'
    ];

    // 🧹 Clean previous folders
    safeTypes.forEach(type => {
        const dirPath = path.join(__dirname, type);
        if (fs.existsSync(dirPath)) {
            fs.rmSync(dirPath, { recursive: true, force: true });
        }
    });

    // 🛠️ Build YAML config
    const yamlContent = {
        export: {},
        exportPacks: {
            autoAddDependentFields: true,
            autoAddDependencies: true
        }
    };

    safeTypes.forEach(type => {
        yamlContent.export[type] = {};
    });

    fs.writeFileSync('exportAllOmni.yaml', yaml.dump(yamlContent));
    const exportCmd = `npx vlocity -sfdx.username ${sourceAlias} packExport -job exportAllOmni.yaml --all --ignoreAllErrors`;
    console.log('🔧 Executing export command:', exportCmd);

    try {
        const result = execSync(exportCmd, {
            encoding: 'utf-8',
            stdio: 'pipe'
        });

        console.log('✅ Export STDOUT:\n', result);

        // 📦 Collect components
        const summary = {};
        safeTypes.forEach(type => {
            const typeDir = path.join(__dirname, type);
            if (fs.existsSync(typeDir)) {
                const entries = fs.readdirSync(typeDir).filter(entry =>
                    fs.statSync(path.join(typeDir, entry)).isDirectory()
                );

                summary[type] = entries;

                entries.forEach(name => {
                    const jsonPath = path.join(typeDir, name, `${name}_DataPack.json`);
                    if (fs.existsSync(jsonPath)) {
                        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
                        storage.saveComponent(sourceAlias, type, name, data);
                    }
                });
            }
        });

        summary.timestamp = new Date().toISOString();
        summary.sourceAlias = sourceAlias;

        storage.saveIndex(sourceAlias, summary);
        return res.json(summary);

    } catch (err) {
        console.error('❌ Export failed');
        console.error('Message:', err.message);
        console.error('STDOUT:', err.stdout?.toString?.());
        console.error('STDERR:', err.stderr?.toString?.());

        return res.status(500).send('Export failed:\n' +
            (err.stderr?.toString?.() || err.message)
        );
    }
});




// GET: View stored components
app.get('/stored-components', (req, res) => {
    const { sourceAlias } = req.query;
    if (!sourceAlias) return res.status(400).send('sourceAlias is required');

    const index = storage.getIndex(sourceAlias);
    if (!index) return res.status(404).send('No stored components found');
    res.json(index);
});


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

    // ✅ Import strip-ansi dynamically (ESM compatibility)
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


// POST: Detect dependencies missing from selected components
// Updated /detect-dependencies endpoint in Node.js
// app.post('/detect-dependencies', (req, res) => {
//     const { selectedComponents } = req.body;

//     if (!selectedComponents || typeof selectedComponents !== 'object') {
//         return res.status(400).send('selectedComponents is required and must be an object');
//     }

//     const missingDeps = {};
//     const isSelected = (type, name) => selectedComponents[type]?.includes(name);

//     for (const [type, names] of Object.entries(selectedComponents)) {
//         for (const name of names) {
//             const baseDir = path.join(type, name);
//             const dataPackPath = path.join(baseDir, `${name}_DataPack.json`);
//             const flexCardJsonPath = path.join(baseDir, `${name}.json`);

//             if (!fs.existsSync(dataPackPath)) continue;
//             const data = JSON.parse(fs.readFileSync(dataPackPath, 'utf-8'));

//             // === 1. Standard VlocityDataPackRelationshipType ===
//             const deps = data?.VlocityDataPackRelationshipType || [];
//             deps.forEach(dep => {
//                 const depType = dep.VlocityDataPackType;
//                 const depName = dep.VlocityDataPackKey.split('/')[1];
//                 if (!isSelected(depType, depName)) {
//                     if (!missingDeps[depType]) missingDeps[depType] = new Set();
//                     missingDeps[depType].add(depName);
//                 }
//             });

//             // === 2. Special handling for FlexCard ===
//             if (type === 'FlexCard' && fs.existsSync(flexCardJsonPath)) {
//                 const fc = JSON.parse(fs.readFileSync(flexCardJsonPath, 'utf-8'));

//                 // 2a. Integration Procedure from dataSource
//                 const ipMethod = fc?.dataSource?.value?.ipMethod;
//                 if (ipMethod && !isSelected('IntegrationProcedure', ipMethod)) {
//                     if (!missingDeps['IntegrationProcedure']) missingDeps['IntegrationProcedure'] = new Set();
//                     missingDeps['IntegrationProcedure'].add(ipMethod);
//                 }

//                 // 2b. DataRaptors from SampleDataSourceResponse keys
//                 const sampleJson = fc?.SampleDataSourceResponse;
//                 try {
//                     const parsedSample = JSON.parse(sampleJson);
//                     for (const key of Object.keys(parsedSample)) {
//                         if (key.endsWith('Status') || key.endsWith('Info') || key === 'response') continue;
//                         if (!isSelected('DataRaptor', key)) {
//                             if (!missingDeps['DataRaptor']) missingDeps['DataRaptor'] = new Set();
//                             missingDeps['DataRaptor'].add(key);
//                         }
//                     }
//                 } catch (e) {
//                     console.warn(`Failed to parse SampleDataSourceResponse for ${name}`);
//                 }
//             }
//         }
//     }

//     // Convert sets to arrays
//     const cleanDeps = {};
//     for (const [key, set] of Object.entries(missingDeps)) {
//         cleanDeps[key] = Array.from(set);
//     }

//     res.json(cleanDeps);
// });



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

app.get('/refresh-components', (req, res) => {
    const { sourceAlias } = req.query;
    if (!sourceAlias) return res.status(400).send('sourceAlias is required');

    console.log(` Refreshing metadata from ${sourceAlias}...`);

    const safeTypes = [
        'OmniScript',
        'FlexCard',
        'DataRaptor',
        'IntegrationProcedure',
        'OmniStudioTrackingService',
        'VlocityUILayout',
        'VlocityUITemplate',
        'CalculationMatrix',
        'CalculationProcedure'
    ];

    // Clean folders
    safeTypes.forEach(type => {
        const dirPath = path.join(__dirname, type);
        if (fs.existsSync(dirPath)) {
            fs.rmSync(dirPath, { recursive: true, force: true });
        }
    });

    // YAML
    const yamlContent = {
        export: {},
        exportPacks: {
            autoAddDependentFields: true,
            autoAddDependencies: true
        }
    };
    safeTypes.forEach(type => {
        yamlContent.export[type] = {};
    });

    fs.writeFileSync('exportAllOmni.yaml', yaml.dump(yamlContent));
    const exportCmd = `npx vlocity -sfdx.username ${sourceAlias} packExport -job exportAllOmni.yaml --all --ignoreAllErrors`;
    console.log('Executing:', exportCmd);

    try {
        const result = execSync(exportCmd, { encoding: 'utf-8' });
        console.log('Export complete');

        const summary = {};
        safeTypes.forEach(type => {
            const typeDir = path.join(__dirname, type);
            if (fs.existsSync(typeDir)) {
                const entries = fs.readdirSync(typeDir).filter(entry =>
                    fs.statSync(path.join(typeDir, entry)).isDirectory()
                );
                summary[type] = entries;

                entries.forEach(name => {
                    const jsonPath = path.join(typeDir, name, `${name}_DataPack.json`);
                    if (fs.existsSync(jsonPath)) {
                        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
                        storage.saveComponent(sourceAlias, type, name, data);
                    }
                });
            }
        });

        summary.timestamp = new Date().toISOString();
        summary.sourceAlias = sourceAlias;
        storage.saveIndex(sourceAlias, summary);

        return res.json(summary);
    } catch (err) {
        console.error('Refresh failed:', err.message);
        return res.status(500).send('Refresh failed:\n' + (err.stderr?.toString?.() || err.message));
    }
});


// POST: Trigger GitLab pipeline
const simpleGit = require('simple-git');
const fsExtra = require('fs-extra');

app.post('/deploy-and-git', async (req, res) => {
    const {
        sourceAlias,
        targetAlias,
        selectedComponents,
        gitBranch = 'main',
        commitMessage = 'Deploy and Git Commit'
    } = req.body;

    if (!sourceAlias || !targetAlias || typeof selectedComponents !== 'object') {
        return res.status(400).json({ status: 'error', message: 'Missing required fields' });
    }

    try {
        const exportYamlPath = path.join(__dirname, 'exportDeployGit.yaml');
        const deployYamlPath = path.join(__dirname, 'deploySelected.yaml');
        const tempDir = './vlocity_temp';

        // Step 1: Build YAML for export
        const exportYaml = {
            export: {},
            exportPacks: {
                autoAddDependencies: true,
                autoAddDependentFields: true
            }
        };

        Object.entries(selectedComponents).forEach(([type, names]) => {
            exportYaml.export[type] = {};
            names.forEach(name => {
                exportYaml.export[type][name] = {};
            });
        });

        fs.writeFileSync(exportYamlPath, yaml.dump(exportYaml));

        // Step 2: Export from source
        const exportCmd = `npx vlocity -sfdx.username ${sourceAlias} packExport -job exportDeployGit.yaml --ignoreAllErrors`;
        console.log('▶ Export:', exportCmd);
        execSync(exportCmd, { stdio: 'inherit' });

        // Step 3: Prepare tempDir for deploy and Git
        fs.rmSync(tempDir, { recursive: true, force: true });
        fs.mkdirSync(tempDir, { recursive: true });

        const deployYaml = { export: {} };

        for (const [type, names] of Object.entries(selectedComponents)) {
            deployYaml.export[type] = {
                queries: names.map(name => `${type}/${name}`)
            };

            for (const name of names) {
                const srcDir = path.join(__dirname, type, name);
                const destDir = path.join(tempDir, type, name);

                if (fs.existsSync(srcDir)) {
                    fs.mkdirSync(destDir, { recursive: true });
                    fs.readdirSync(srcDir).forEach(file => {
                        fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
                    });
                }
            }
        }

        fs.writeFileSync(deployYamlPath, yaml.dump(deployYaml));

        // Step 4: Deploy to target org
        const deployCmd = `npx vlocity -sfdx.username ${targetAlias} packDeploy -job deploySelected.yaml --force --ignoreAllErrors --nojob`;
        console.log('Deploy:', deployCmd);
        execSync(deployCmd, { cwd: tempDir, stdio: 'inherit' });

        // Step 5: Push to Git
        const repoDir = path.join(__dirname, 'git-export');
        const GITLAB_REPO_URL = process.env.GITLAB_REPO_URL;

        fsExtra.removeSync(repoDir);
        await simpleGit().clone(GITLAB_REPO_URL, repoDir);

        await fsExtra.copy(tempDir, path.join(repoDir, 'components'), { overwrite: true });

        const git = simpleGit(repoDir);
        await git.checkout(gitBranch);
        await git.add('./*');
        await git.commit(commitMessage);
        await git.push('origin', gitBranch);

        return res.status(200).json({
            status: 'success',
            message: 'Deployment and Git commit successful.'
        });

    } catch (err) {
        console.error('deploy-and-git error:', err.message || err);
        return res.status(500).json({
            status: 'error',
            message: err.message || 'Unexpected error during deploy-and-git'
        });
    }
});





// Start server
app.listen(3000, () => {
    console.log('Deployment API running at http://localhost:3000');
});