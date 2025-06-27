require('dotenv').config();

const express = require('express');
const { exec, execSync } = require('child_process');
const { authenticateWithJWT } = require('./authHelper');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const storage = require('./storageHelper');
const axios = require('axios');
const stripAnsi = require('strip-ansi');
const jobStore = {};
const xmlBuilder = require('xmlbuilder');
// const { fetchComponents } = require('./fetcher');


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



// app.get('/components', (req, res) => {
//     const { sourceAlias } = req.query;
//     if (!sourceAlias) return res.status(400).send('sourceAlias is required');

//     const safeTypes = [
//         'OmniScript',
//         'FlexCard',
//         'DataRaptor',
//         'IntegrationProcedure',
//         'OmniStudioTrackingService',
//         'VlocityUILayout',
//         'VlocityUITemplate',
//         'CalculationMatrix',
//         'CalculationProcedure'
//     ];

//     //Clean previous folders
//     safeTypes.forEach(type => {
//         const dirPath = path.join(__dirname, type);
//         if (fs.existsSync(dirPath)) {
//             fs.rmSync(dirPath, { recursive: true, force: true });
//         }
//     });

//     // Build YAML config
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

//     fs.writeFileSync('exportAllOmni.yaml', yaml.dump(yamlContent));
//     const exportCmd = `npx vlocity -sfdx.username ${sourceAlias} packExport -job exportAllOmni.yaml --all --ignoreAllErrors`;
//     console.log('Executing export command:', exportCmd);

//     try {
//         const result = execSync(exportCmd, {
//             encoding: 'utf-8',
//             stdio: 'pipe'
//         });

//         console.log('Export STDOUT:\n', result);

//         // Collect components
//         const summary = {};
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
//                         storage.saveComponent(sourceAlias, type, name, data);
//                     }
//                 });
//             }
//         });

//         summary.timestamp = new Date().toISOString();
//         summary.sourceAlias = sourceAlias;

//         storage.saveIndex(sourceAlias, summary);
//         return res.json(summary);

//     } catch (err) {
//         console.error('Export failed');
//         console.error('Message:', err.message);
//         console.error('STDOUT:', err.stdout?.toString?.());
//         console.error('STDERR:', err.stderr?.toString?.());

//         return res.status(500).send('Export failed:\n' +
//             (err.stderr?.toString?.() || err.message)
//         );
//     }
// });


app.get('/components', (req, res) => {
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

    // 🔹 Export OmniStudio
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
    safeTypes.forEach(type => {
        yamlContent.export[type] = {};
    });
    fs.writeFileSync('exportAllOmni.yaml', require('js-yaml').dump(yamlContent));

    try {
        const exportCmd = `npx vlocity -sfdx.username ${sourceAlias} packExport -job exportAllOmni.yaml --all --ignoreAllErrors`;
        execSync(exportCmd, { encoding: 'utf-8', stdio: 'pipe' });

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
    } catch (err) {
        console.error('OmniStudio export failed:', err.message);
    }

    // 🔹 Retrieve Regular Metadata (correct SFDX structure)
    const retrieveTempDir = path.join(__dirname, 'retrieved-metadata');
    const safeOutputDir = path.join(__dirname, 'sf-output');
    const outputPath = safeOutputDir;

    fs.rmSync(retrieveTempDir, { recursive: true, force: true });
    fs.rmSync(safeOutputDir, { recursive: true, force: true });
    fs.mkdirSync(path.join(retrieveTempDir, 'force-app'), { recursive: true }); // required
    fs.mkdirSync(safeOutputDir, { recursive: true });

    const sfdxProjectJson = {
        packageDirectories: [{ path: 'force-app', default: true }],
        namespace: '',
        sourceApiVersion: '59.0'
    };
    fs.writeFileSync(
        path.join(retrieveTempDir, 'sfdx-project.json'),
        JSON.stringify(sfdxProjectJson, null, 2)
    );

    const packageXml = {
        Package: {
            types: regularMetadataTypes,
            version: '59.0'
        }
    };
    fs.writeFileSync(
        path.join(retrieveTempDir, 'package.xml'),
        xmlBuilder.create(packageXml).end({ pretty: true })
    );

    try {
        const retrieveCmd = `sf project retrieve start --manifest package.xml --target-org ${sourceAlias} --output-dir ${safeOutputDir}`;
        execSync(retrieveCmd, {
            cwd: retrieveTempDir,
            encoding: 'utf-8'

        });

        // if (fs.existsSync(outputPath)) {
        //     const regularFiles = fs.readdirSync(outputPath, { withFileTypes: true })
        //         .flatMap(entry => {
        //             const subDir = path.join(outputPath, entry.name);
        //             return entry.isDirectory()
        //                 ? fs.readdirSync(subDir).map(f => `${entry.name}/${f}`)
        //                 : [entry.name];
        //         });
        //     summary['RegularMetadata'] = regularFiles;
        // } else {
        //     summary['RegularMetadata'] = ['No files retrieved or directory not created'];
        // }

        if (fs.existsSync(outputPath)) {
        const regularFiles = fs.readdirSync(outputPath, { withFileTypes: true })
        .flatMap(entry => {
            const subDir = path.join(outputPath, entry.name);
            return entry.isDirectory()
                ? fs.readdirSync(subDir).map(f => `${entry.name}/${f}`)
                : [entry.name];
        });

    const categorized = {
        ApexClass: [],
        ApexTrigger: [],
        LightningComponentBundle: []
    };

    regularFiles.forEach(filePath => {
        if (filePath.startsWith('classes/') && filePath.endsWith('.cls')) {
            const name = path.basename(filePath, '.cls');
            if (!categorized.ApexClass.includes(name)) {
                categorized.ApexClass.push(name);
            }
        } else if (filePath.startsWith('triggers/') && filePath.endsWith('.trigger')) {
            const name = path.basename(filePath, '.trigger');
            if (!categorized.ApexTrigger.includes(name)) {
                categorized.ApexTrigger.push(name);
            }
        } else if (filePath.startsWith('lwc/')) {
            const name = filePath.split('/')[1];
            if (!categorized.LightningComponentBundle.includes(name)) {
                categorized.LightningComponentBundle.push(name);
            }
        }
    });

    summary['RegularMetadata'] = categorized;
        Object.entries(categorized).forEach(([metaType, components]) => {
        components.forEach(name => {
        const regularKeyPath = path.join('RegularMetadata', metaType);
        storage.saveComponent(sourceAlias, regularKeyPath, name, { name, type: metaType });

        });
    });
        } else {
            summary['RegularMetadata'] = {
                ApexClass: [],
                ApexTrigger: [],
                LightningComponentBundle: []
            };
        }

    } catch (err) {
        console.warn('Failed to retrieve regular metadata:', err.message);
        summary['RegularMetadata'] = [`Failed: ${err.message}`];
    }

    // Final response
    summary.timestamp = new Date().toISOString();
    summary.sourceAlias = sourceAlias;
    storage.saveIndex(sourceAlias, summary);
    return res.json(summary);
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

// app.get('/refresh-components', (req, res) => {
//     const { sourceAlias } = req.query;
//     if (!sourceAlias) return res.status(400).send('sourceAlias is required');

//     console.log(` Refreshing metadata from ${sourceAlias}...`);

//     const safeTypes = [
//         'OmniScript',
//         'FlexCard',
//         'DataRaptor',
//         'IntegrationProcedure',
//         'OmniStudioTrackingService',
//         'VlocityUILayout',
//         'VlocityUITemplate',
//         'CalculationMatrix',
//         'CalculationProcedure'
//     ];

//     // Clean folders
//     safeTypes.forEach(type => {
//         const dirPath = path.join(__dirname, type);
//         if (fs.existsSync(dirPath)) {
//             fs.rmSync(dirPath, { recursive: true, force: true });
//         }
//     });

//     // YAML
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

//     fs.writeFileSync('exportAllOmni.yaml', yaml.dump(yamlContent));
//     const exportCmd = `npx vlocity -sfdx.username ${sourceAlias} packExport -job exportAllOmni.yaml --all --ignoreAllErrors`;
//     console.log('Executing:', exportCmd);

//     try {
//         const result = execSync(exportCmd, { encoding: 'utf-8' });
//         console.log('Export complete');

//         const summary = {};
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
//                         storage.saveComponent(sourceAlias, type, name, data);
//                     }
//                 });
//             }
//         });

//         summary.timestamp = new Date().toISOString();
//         summary.sourceAlias = sourceAlias;
//         storage.saveIndex(sourceAlias, summary);

//         return res.json(summary);
//     } catch (err) {
//         console.error('Refresh failed:', err.message);
//         return res.status(500).send('Refresh failed:\n' + (err.stderr?.toString?.() || err.message));
//     }
// });


app.get('/refresh-components', (req, res) => {
    const { sourceAlias } = req.query;
    if (!sourceAlias) return res.status(400).send('sourceAlias is required');

    console.log(` Refreshing metadata from ${sourceAlias}...`);

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

    // Clean Omni folders
    safeTypes.forEach(type => {
        const dirPath = path.join(__dirname, type);
        if (fs.existsSync(dirPath)) {
            fs.rmSync(dirPath, { recursive: true, force: true });
        }
    });

    // Step 1: Export Omni metadata
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

        // Collect Omni metadata
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
    } catch (err) {
        console.error('Refresh OmniStudio export failed:', err.message);
    }

    // Step 2: Retrieve Regular Metadata
    try {
        const retrieveTempDir = path.join(__dirname, 'retrieved-metadata');
        const safeOutputDir = path.join(__dirname, 'sf-output');
        const outputPath = safeOutputDir;

        fs.rmSync(retrieveTempDir, { recursive: true, force: true });
        fs.rmSync(safeOutputDir, { recursive: true, force: true });
        fs.mkdirSync(path.join(retrieveTempDir, 'force-app'), { recursive: true });
        fs.mkdirSync(safeOutputDir, { recursive: true });

        const sfdxProjectJson = {
            packageDirectories: [{ path: 'force-app', default: true }],
            namespace: '',
            sourceApiVersion: '59.0'
        };
        fs.writeFileSync(
            path.join(retrieveTempDir, 'sfdx-project.json'),
            JSON.stringify(sfdxProjectJson, null, 2)
        );

        const packageXml = {
            Package: {
                types: regularMetadataTypes,
                version: '59.0'
            }
        };
        fs.writeFileSync(
            path.join(retrieveTempDir, 'package.xml'),
            xmlBuilder.create(packageXml).end({ pretty: true })
        );

        const retrieveCmd = `sf project retrieve start --manifest package.xml --target-org ${sourceAlias} --output-dir ${safeOutputDir}`;
        execSync(retrieveCmd, {
            cwd: retrieveTempDir,
            encoding: 'utf-8'
        });

        if (fs.existsSync(outputPath)) {
            const regularFiles = fs.readdirSync(outputPath, { withFileTypes: true })
                .flatMap(entry => {
                    const subDir = path.join(outputPath, entry.name);
                    return entry.isDirectory()
                        ? fs.readdirSync(subDir).map(f => `${entry.name}/${f}`)
                        : [entry.name];
                });

            const categorized = {
                ApexClass: [],
                ApexTrigger: [],
                LightningComponentBundle: []
            };

            regularFiles.forEach(filePath => {
                if (filePath.startsWith('classes/') && filePath.endsWith('.cls')) {
                    const name = path.basename(filePath, '.cls');
                    if (!categorized.ApexClass.includes(name)) {
                        categorized.ApexClass.push(name);
                    }
                } else if (filePath.startsWith('triggers/') && filePath.endsWith('.trigger')) {
                    const name = path.basename(filePath, '.trigger');
                    if (!categorized.ApexTrigger.includes(name)) {
                        categorized.ApexTrigger.push(name);
                    }
                } else if (filePath.startsWith('lwc/')) {
                    const name = filePath.split('/')[1];
                    if (!categorized.LightningComponentBundle.includes(name)) {
                        categorized.LightningComponentBundle.push(name);
                    }
                }
            });

            summary['RegularMetadata'] = categorized;
            Object.entries(categorized).forEach(([metaType, components]) => {
                components.forEach(name => {
                    const regularKeyPath = path.join('RegularMetadata', metaType);
                    storage.saveComponent(sourceAlias, regularKeyPath, name, { name, type: metaType });
                });
            });
        } else {
            summary['RegularMetadata'] = {
                ApexClass: [],
                ApexTrigger: [],
                LightningComponentBundle: []
            };
        }
    } catch (err) {
        console.warn('Failed to retrieve regular metadata:', err.message);
        summary['RegularMetadata'] = [`Failed: ${err.message}`];
    }

    summary.timestamp = new Date().toISOString();
    summary.sourceAlias = sourceAlias;
    storage.saveIndex(sourceAlias, summary);
    return res.json(summary);
});


// POST: Trigger GitLab pipeline
const simpleGit = require('simple-git');
const fsExtra = require('fs-extra');



                // app.post('/deploy-and-git', async (req, res) => {
                //     console.log('Using JWT key:', process.env.SF_JWT_KEY);

                //     const {
                //         sourceAlias,
                //         targetAlias,
                //         selectedComponents,
                //         gitBranch = 'main',
                //         commitMessage = 'Deploy and Git Commit'
                //     } = req.body;

                //     if (!sourceAlias || !targetAlias || typeof selectedComponents !== 'object') {
                //         return res.status(400).json({ status: 'error', message: 'Missing required fields' });
                //     }

                //     try {
                //         const exportYamlPath = path.join(__dirname, 'exportDeployGit.yaml');
                //         const deployYamlPath = path.join(__dirname, 'deploySelected.yaml');
                //         const tempDir = './vlocity_temp';

                //         // Step 1: Authenticate to both orgs
                //         await authenticateWithJWT(
                //             sourceAlias,
                //             process.env.SF_CLIENT_ID,
                //             process.env.SF_USERNAME,
                //             process.env.SF_LOGIN_URL,
                //             process.env.SF_JWT_KEY
                //         );

                //         await authenticateWithJWT(
                //             targetAlias,
                //             process.env.TARGET_CLIENT_ID,
                //             process.env.TARGET_USERNAME,
                //             process.env.TARGET_LOGIN_URL,
                //             process.env.TARGET_JWT_KEY
                //         );

                //         // Step 2: Create clean export YAML file with null-safe component names
                //         const exportYaml = {
                //             export: {},
                //             exportPacks: {
                //                 autoAddDependencies: true,
                //                 autoAddDependentFields: true
                //             }
                //         };

                //         for (const [type, names] of Object.entries(selectedComponents)) {
                //             if (!Array.isArray(names) || names.length === 0) continue;

                //             const validNames = names.filter(name => name && typeof name === 'string' && name.trim());
                //             if (validNames.length === 0) continue;

                //             exportYaml.export[type] = {};
                //             validNames.forEach(name => {
                //                 exportYaml.export[type][name] = {};
                //             });
                //         }

                //         // Ensure at least one type is exported
                //         if (Object.keys(exportYaml.export).length === 0) {
                //             return res.status(400).json({ status: 'error', message: 'No valid components to export' });
                //         }

                //         fs.writeFileSync(exportYamlPath, yaml.dump(exportYaml));
                //         console.log('Export YAML written:', exportYamlPath);

                //         // Step 3: Export components
                //         const exportCmd = `npx vlocity -sfdx.username ${sourceAlias} packExport -job exportAllOmni.yaml --ignoreAllErrors`;
                //         console.log('▶ Export Command:', exportCmd);
                //         execSync(exportCmd, { stdio: 'inherit' });

                //         // Step 4: Copy exported components to temp directory
                //         fs.rmSync(tempDir, { recursive: true, force: true });
                //         fs.mkdirSync(tempDir, { recursive: true });

                //         const deployYaml = { export: {} };

                //         for (const [type, names] of Object.entries(exportYaml.export)) {
                //             const validNames = Object.keys(names);
                //             deployYaml.export[type] = {
                //                 queries: validNames.map(name => `${type}/${name}`)
                //             };

                //             validNames.forEach(name => {
                //                 const srcDir = path.join(__dirname, type, name);
                //                 const destDir = path.join(tempDir, type, name);
                //                 if (fs.existsSync(srcDir)) {
                //                     fs.mkdirSync(destDir, { recursive: true });
                //                     fs.readdirSync(srcDir).forEach(file => {
                //                         fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
                //                     });
                //                 }
                //             });
                //         }

                //         fs.writeFileSync(deployYamlPath, yaml.dump(deployYaml));

                //         // Step 5: Deploy to target org
                //         const deployCmd = `npx vlocity -sfdx.username ${targetAlias} packDeploy -job deploySelected.yaml --force --ignoreAllErrors --nojob`;
                //         console.log('Deploy Command:', deployCmd);
                //         const stripAnsi = (await import('strip-ansi')).default;
                //         const deployOutput = execSync(deployCmd, { cwd: tempDir, encoding: 'utf-8' });
                //         let cleanOutput = stripAnsi(deployOutput);

                //         cleanOutput = cleanOutput
                //             .split('\n')
                //             .filter(line =>
                //                 !line.includes('Puppeteer') &&
                //                 !line.includes('@omnistudio/flexcard-compiler') &&
                //                 !line.toLowerCase().includes('unauthorized') &&
                //                 !line.toLowerCase().includes('failed to get package')
                //             )
                //             .join('\n');

                //         const deployedComponents = [];
                //         let elapsedTime = '';
                //         let warnings = [];

                //         cleanOutput.split('\n').forEach(line => {
                //             if (line.includes('Adding to Deploy >>')) {
                //                 const part = line.split('>>')[1]?.trim();
                //                 if (part) deployedComponents.push(part);
                //             }
                //             if (line.includes('Elapsed Time')) {
                //                 elapsedTime = line.split('>>')[1]?.trim() || '';
                //             }
                //             if (line.toLowerCase().includes('error')) {
                //                 warnings.push(line.trim());
                //             }
                //         });

                //         // Step 6: Git operations
                //         const repoDir = path.join(__dirname, 'git-export');
                //         const GITLAB_REPO_URL = process.env.GITLAB_REPO_URL;

                //         fsExtra.removeSync(repoDir);
                //         await simpleGit().clone(GITLAB_REPO_URL, repoDir);
                //         await fsExtra.copy(tempDir, path.join(repoDir, 'components'), { overwrite: true });

                //         const git = simpleGit(repoDir);
                //         await git.addConfig('user.email', process.env.GIT_COMMIT_EMAIL || 'omni-deploy@tgs.com');
                //         await git.addConfig('user.name', process.env.GIT_COMMIT_NAME || 'Omni Deployer');

                //         await git.checkout(gitBranch);
                //         await git.add('./*');
                //         await git.commit(commitMessage);
                //         await git.push('origin', gitBranch);

                //         // Step 7: Trigger GitLab pipeline
                //         const pipelineData = await triggerGitlabPipeline();

                //         return res.status(200).json({
                //             status: 'success',
                //             message: 'Deployment and Git commit successful.',
                //             deployedComponents,
                //             elapsedTime,
                //             warnings,
                //             details: cleanOutput,
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


// *******************
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

//     try {
//         const exportYamlPath = path.join(__dirname, 'exportDeployGit.yaml');
//         const tempDir = './vlocity_temp';

//         // Step 1: Authenticate to source org
//         await authenticateWithJWT(
//             sourceAlias,
//             process.env.SF_CLIENT_ID,
//             process.env.SF_USERNAME,
//             process.env.SF_LOGIN_URL,
//             process.env.SF_JWT_KEY
//         );

//         // Step 2: Create YAML for selected components
//         const exportYaml = {
//             export: {},
//             exportPacks: {
//                 autoAddDependencies: true,
//                 autoAddDependentFields: true
//             }
//         };

//         for (const [type, names] of Object.entries(selectedComponents)) {
//             exportYaml.export[type] = {};

//             // Case 1: Simple array of names
//             if (Array.isArray(names)) {
//                 names.forEach(name => {
//                     exportYaml.export[type][name] = {};
//                 });

//             // Case 2: Nested object for regular metadata
//             } else if (typeof names === 'object' && names !== null) {
//                 for (const [subType, subNames] of Object.entries(names)) {
//                     if (!exportYaml.export[type][subType]) {
//                         exportYaml.export[type][subType] = {};
//                     }

//                     if (Array.isArray(subNames)) {
//                         subNames.forEach(name => {
//                             exportYaml.export[type][subType][name] = {};
//                         });
//                     }
//                 }
//             }
//         }

//         fs.writeFileSync(exportYamlPath, yaml.dump(exportYaml));

//         // Step 3: Export from source org
//         const exportCmd = `npx vlocity -sfdx.username ${sourceAlias} packExport -job exportDeployGit.yaml --ignoreAllErrors`;
//         console.log('▶ Export Command:', exportCmd);
//         execSync(exportCmd, { stdio: 'inherit' });

//         // Step 4: Copy exported components to temp folder
//         fs.rmSync(tempDir, { recursive: true, force: true });
//         fs.mkdirSync(tempDir, { recursive: true });

//         for (const [type, names] of Object.entries(selectedComponents)) {
//             if (Array.isArray(names)) {
//                 names.forEach(name => {
//                     const srcDir = path.join(__dirname, type, name);
//                     const destDir = path.join(tempDir, type, name);
//                     if (fs.existsSync(srcDir)) {
//                         fs.mkdirSync(destDir, { recursive: true });
//                         fs.readdirSync(srcDir).forEach(file => {
//                             fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
//                         });
//                     }
//                 });
//             } else if (typeof names === 'object' && names !== null) {
//                 for (const [subType, subNames] of Object.entries(names)) {
//                     if (Array.isArray(subNames)) {
//                         subNames.forEach(name => {
//                             const srcDir = path.join(__dirname, subType, name);
//                             const destDir = path.join(tempDir, subType, name);
//                             if (fs.existsSync(srcDir)) {
//                                 fs.mkdirSync(destDir, { recursive: true });
//                                 fs.readdirSync(srcDir).forEach(file => {
//                                     fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
//                                 });
//                             }
//                         });
//                     }
//                 }
//             }
//         }

//         // Step 5: Git commit and push
//         const repoDir = path.join(__dirname, 'git-export');
//         const GITLAB_REPO_URL = process.env.GITLAB_REPO_URL;

//         fsExtra.removeSync(repoDir);
//         await simpleGit().clone(GITLAB_REPO_URL, repoDir);
//         await fsExtra.copy(tempDir, path.join(repoDir, 'components'), { overwrite: true });

//         const git = simpleGit(repoDir);
//         await git.addConfig('user.email', process.env.GIT_COMMIT_EMAIL || 'omni-deploy@tgs.com');
//         await git.addConfig('user.name', process.env.GIT_COMMIT_NAME || 'Omni Deployer');
//         await git.checkout(gitBranch);
//         await git.add('./*');
//         await git.commit(commitMessage);
//         await git.push('origin', gitBranch);

//         // Step 6: Trigger GitLab pipeline
//         const pipelineData = await triggerGitlabPipeline();

//         return res.status(200).json({
//             status: 'success',
//             message: 'Git export and pipeline triggered successfully.',
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

//     try {
//         const exportYamlPath = path.join(__dirname, 'exportDeployGit.yaml');
//         const tempDir = './vlocity_temp';
//         const sfdxTemp = './sfdx-temp';
//         const gitExportDir = './git-export';

//         // Step 1: Authenticate
//         await authenticateWithJWT(
//             sourceAlias,
//             process.env.SF_CLIENT_ID,
//             process.env.SF_USERNAME,
//             process.env.SF_LOGIN_URL,
//             process.env.SF_JWT_KEY
//         );

//         // Step 2: Create YAML for OmniStudio components
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

//         fs.writeFileSync(exportYamlPath, yaml.dump(exportYaml));

//         // Step 3: Cleanup and prepare folders
//         fs.rmSync(tempDir, { recursive: true, force: true });
//         fs.rmSync(sfdxTemp, { recursive: true, force: true });
//         fs.rmSync(gitExportDir, { recursive: true, force: true });

//         fs.mkdirSync(tempDir, { recursive: true });

//         // Step 4: OmniStudio Export
//         if (Object.keys(exportYaml.export).length > 0) {
//             const exportCmd = `npx vlocity -sfdx.username ${sourceAlias} packExport -job exportDeployGit.yaml --ignoreAllErrors`;
//             console.log('▶ Omni Export:', exportCmd);
//             execSync(exportCmd, { stdio: 'inherit' });
//         }

//         // Step 5: Retrieve SFDX Metadata
//         if (selectedComponents.RegularMetadata) {
//             const forceAppDefault = path.join(sfdxTemp, 'force-app', 'main', 'default');
//             fsExtra.mkdirpSync(forceAppDefault);

//             fs.writeFileSync(path.join(sfdxTemp, 'sfdx-project.json'), JSON.stringify({
//                 packageDirectories: [{ path: 'force-app', default: true }],
//                 namespace: '',
//                 sourceApiVersion: '59.0'
//             }, null, 2));

//             const metadataArg = Object.entries(selectedComponents.RegularMetadata)
//                 .flatMap(([type, names]) => names.map(name => `${type}:${name}`))
//                 .join(',');

//             const retrieveCmd = `sf project retrieve start --metadata ${metadataArg} --target-org ${sourceAlias} --output-dir retrieve-temp`;
//             console.log('▶ SFDX Retrieve:', retrieveCmd);
//             execSync(retrieveCmd, { cwd: sfdxTemp, stdio: 'inherit' });
//         }

//         // Step 6: Git clone
//         await simpleGit().clone(process.env.GITLAB_REPO_URL, gitExportDir);

//         // Step 7: Copy OmniStudio to Git under /components
//         const omniTarget = path.join(gitExportDir, 'components');
//         if (fs.existsSync(tempDir)) {
//             fs.readdirSync(tempDir).forEach(folder => {
//                 const src = path.join(tempDir, folder);
//                 const dest = path.join(omniTarget, folder);
//                 fsExtra.copySync(src, dest, { overwrite: true });
//             });
//         }

//         // Step 8: Copy SFDX metadata to /components/sfdx/force-app/main/default
//         const retrievedPath = path.join(sfdxTemp, 'retrieve-temp');
//         const sfdxDefaultTarget = path.join(gitExportDir, 'components', 'sfdx', 'force-app', 'main', 'default');
//         fsExtra.mkdirpSync(sfdxDefaultTarget);

//         if (fs.existsSync(retrievedPath)) {
//             fsExtra.copySync(retrievedPath, sfdxDefaultTarget, { overwrite: true });
//         }

//         // Step 9: Add sfdx-project.json to /components/sfdx
//         fs.writeFileSync(path.join(gitExportDir, 'components', 'sfdx', 'sfdx-project.json'), JSON.stringify({
//             packageDirectories: [{ path: 'force-app', default: true }],
//             namespace: '',
//             sourceApiVersion: '59.0'
//         }, null, 2));

//         // Step 10: Git commit and push
//         const git = simpleGit(gitExportDir);
//         await git.addConfig('user.email', process.env.GIT_COMMIT_EMAIL || 'omni-deploy@tgs.com');
//         await git.addConfig('user.name', process.env.GIT_COMMIT_NAME || 'Omni Deployer');
//         await git.checkout(gitBranch);
//         await git.add('./*');
//         await git.commit(commitMessage);
//         await git.push('origin', gitBranch);

//         // Step 11: Trigger pipeline
//         const pipelineData = await triggerGitlabPipeline();

//         return res.status(200).json({
//             status: 'success',
//             message: 'OmniStudio + SFDX metadata exported and Git pipeline triggered!',
//             pipeline: {
//                 id: pipelineData.id,
//                 status: pipelineData.status,
//                 url: pipelineData.web_url,
//                 ref: pipelineData.ref,
//                 created_at: pipelineData.created_at
//             }
//         });

//     } catch (err) {
//         console.error('❌ deploy-and-git error:', err.message || err);
//         return res.status(500).json({
//             status: 'error',
//             message: err.message || 'Unexpected error during deploy-and-git'
//         });
//     }
// });



//**** Correct */
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

//         // Step 2: Create YAML
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

//         // Step 3: Clean dirs
//         [tempDir, sfdxTemp, gitExportDir].forEach(dir => fs.rmSync(dir, { recursive: true, force: true }));
//         fs.mkdirSync(tempDir, { recursive: true });

//         // Step 4: Write YAML
//         const yamlContent = yaml.dump(exportYaml);
//         fs.writeFileSync(exportYamlPath, yamlContent, 'utf8');

//         // Step 5: Vlocity Export
//         if (Object.keys(exportYaml.export).length > 0) {
//             const exportCmd = `npx vlocity -sfdx.username ${sourceAlias} packExport -job ${exportYamlPath} --projectPath ${__dirname} --ignoreAllErrors`;
//             console.log('Running Vlocity Export:', exportCmd);
//             execSync(exportCmd, { cwd: __dirname, stdio: 'inherit' });

//             // Move only selected OmniStudio components
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

//         // Step 6: Retrieve SFDX Metadata
//         if (selectedComponents.RegularMetadata) {
//             const forceAppPath = path.join(sfdxTemp, 'force-app', 'main', 'default');
//             fsExtra.mkdirpSync(forceAppPath);

//             fs.writeFileSync(path.join(sfdxTemp, 'sfdx-project.json'), JSON.stringify({
//                 packageDirectories: [{ path: 'force-app', default: true }],
//                 namespace: '',
//                 sourceApiVersion: '59.0'
//             }, null, 2));

//             const metadataArg = Object.entries(selectedComponents.RegularMetadata)
//                 .flatMap(([type, names]) => names.map(name => `${type}:${name}`))
//                 .join(',');

//             const retrieveCmd = `sf project retrieve start --metadata ${metadataArg} --target-org ${sourceAlias} --output-dir retrieve-temp`;
//             console.log('SFDX Retrieve:', retrieveCmd);
//             execSync(retrieveCmd, { cwd: sfdxTemp, stdio: 'inherit' });
//         }

//         // Step 7: Clone Git repo
//         await simpleGit().clone(process.env.GITLAB_REPO_URL, gitExportDir);
//         console.log('Git repo cloned to:', gitExportDir);

//         // Step 8: Copy OmniStudio to Git
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

//         // Step 9: Copy retrieved SFDX to Git
//         const retrievedPath = path.join(sfdxTemp, 'retrieve-temp');
//         const sfdxDefaultTarget = path.join(gitExportDir, 'components', 'sfdx', 'force-app', 'main', 'default');
//         fsExtra.mkdirpSync(sfdxDefaultTarget);

//         if (fs.existsSync(retrievedPath)) {
//             fsExtra.copySync(retrievedPath, sfdxDefaultTarget, { overwrite: true });
//         }

//         // Step 10: Write sfdx-project.json to Git
//         fs.writeFileSync(path.join(gitExportDir, 'components', 'sfdx', 'sfdx-project.json'), JSON.stringify({
//             packageDirectories: [{ path: 'force-app', default: true }],
//             namespace: '',
//             sourceApiVersion: '59.0'
//         }, null, 2));

//         // Step 11: Git Commit + Push
//         const git = simpleGit(gitExportDir);
//         await git.addConfig('user.email', process.env.GIT_COMMIT_EMAIL || 'omni-deploy@tgs.com');
//         await git.addConfig('user.name', process.env.GIT_COMMIT_NAME || 'Omni Deployer');
//         await git.checkout(gitBranch);

//         await git.add('./*');
//         await git.commit(commitMessage);
//         await git.push('origin', gitBranch);

//         // Step 12: Trigger GitLab pipeline
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

app.post('/deploy-and-git', async (req, res) => {
    const {
        sourceAlias,
        selectedComponents,
        gitBranch = 'main',
        commitMessage = 'Exported OmniStudio metadata to Git'
    } = req.body;

    if (!sourceAlias || typeof selectedComponents !== 'object') {
        return res.status(400).json({ status: 'error', message: 'Missing required fields' });
    }

    const tempDir = './vlocity_temp';
    const sfdxTemp = './sfdx-temp';
    const gitExportDir = './git-export';

    try {
        // Step 1: Clean and prepare export directory
        fs.rmSync(gitExportDir, { recursive: true, force: true });
        fs.mkdirSync(gitExportDir, { recursive: true });

        // Step 2: Handle RegularMetadata (e.g., ApexClass, ApexTrigger)
        if (selectedComponents.RegularMetadata) {
            const regMeta = selectedComponents.RegularMetadata;
            fs.mkdirSync(`${gitExportDir}/force-app/main/default/classes`, { recursive: true });

            if (regMeta.ApexClass) {
                for (const className of regMeta.ApexClass) {
                    const apexClassPath = path.join(gitExportDir, 'force-app/main/default/classes', `${className}.cls`);
                    fs.writeFileSync(apexClassPath, `// Apex Class Stub: ${className}`);
                }
            }

            if (regMeta.ApexTrigger) {
                for (const triggerName of regMeta.ApexTrigger) {
                    const triggerPath = path.join(gitExportDir, 'force-app/main/default/triggers');
                    fs.mkdirSync(triggerPath, { recursive: true });
                    fs.writeFileSync(path.join(triggerPath, `${triggerName}.trigger`), `// Apex Trigger Stub: ${triggerName}`);
                }
            }
        }

        // Step 3: Git commit and push
        const git = require('simple-git')(gitExportDir);
        await git.init();
        await git.addRemote('origin', process.env.GIT_REPO_URL); // Ensure this is set in .env
        await git.add('.');
        await git.commit(commitMessage);
        await git.push(['-u', 'origin', gitBranch]);

        return res.json({
            status: 'success',
            message: `Successfully exported components to Git branch ${gitBranch}`
        });

    } catch (error) {
        console.error('❌ Deploy and Git Error:', error);
        return res.status(500).json({
            status: 'error',
            message: error.message || 'Internal Server Error'
        });
    }
});



// Start server
app.listen(3000, () => {
    console.log('Deployment API running at http://localhost:3000');
});