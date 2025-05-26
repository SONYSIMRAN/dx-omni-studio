// const express = require('express');
// const { exec, execSync } = require('child_process');
// const fs = require('fs');
// const path = require('path');
// const yaml = require('js-yaml');
// const storage = require('./storageHelper');

// const app = express();
// app.use(express.json());

// // GET all OmniStudio components (export full with dependencies)
// app.get('/components', (req, res) => {
//     const { sourceAlias } = req.query;
//     if (!sourceAlias) return res.status(400).send('sourceAlias is required');

//     const yamlContent = {
//         projectPath: '.',
//         export: {
//             OmniScript: {},
//             IntegrationProcedure: {},
//             DataRaptor: {},
//             FlexCard: {},
//             OmniStudioAction: {},
//             VlocityUITemplate: {},
//             VlocityUILayout: {},
//             CalculationMatrix: {},
//             CalculationProcedure: {},
//             OmniStudioTrackingService: {}
//         },
//         exportPacks: {
//             autoAddDependentFields: true,
//             autoAddDependencies: true
//         }
//     };

//     fs.writeFileSync('exportAllOmni.yaml', yaml.dump(yamlContent));

//     const exportCmd = `npx vlocity -sfdx.username ${sourceAlias} packExport -job exportAllOmni.yaml --all`;
//     console.log(`Exporting with command: ${exportCmd}`);

//     exec(exportCmd, (err, stdout, stderr) => {
//         console.log('Export STDOUT:\n', stdout);
//         console.error('Export STDERR:\n', stderr);

//         if (err) {
//             return res.status(500).send('Export failed');
//         }

//         const omniScripts = fs.existsSync('./OmniScript')
//             ? fs.readdirSync('./OmniScript').filter(entry =>
//                 fs.statSync(path.join('./OmniScript', entry)).isDirectory())
//             : [];

//         const dataRaptors = fs.existsSync('./DataRaptor')
//             ? fs.readdirSync('./DataRaptor').filter(entry =>
//                 fs.statSync(path.join('./DataRaptor', entry)).isDirectory())
//             : [];

//         const summary = {
//             timestamp: new Date().toISOString(),
//             sourceAlias,
//             OmniScript: omniScripts,
//             DataRaptor: dataRaptors
//         };

//         // Save index and each component
//         storage.saveIndex(sourceAlias, summary);

//         [...omniScripts.map(name => ['OmniScript', name]), ...dataRaptors.map(name => ['DataRaptor', name])]
//             .forEach(([type, name]) => {
//                 const jsonPath = path.join(`./${type}/${name}`, `${name}_DataPack.json`);
//                 if (fs.existsSync(jsonPath)) {
//                     const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
//                     storage.saveComponent(sourceAlias, type, name, data);
//                 }
//             });

//         res.json(summary);
//     });
// });

// // GET stored components from file
// app.get('/stored-components', (req, res) => {
//     const { sourceAlias } = req.query;
//     if (!sourceAlias) return res.status(400).send('sourceAlias is required');

//     const index = storage.getIndex(sourceAlias);
//     if (!index) return res.status(404).send('No stored components found');
//     res.json(index);
// });

// // POST deploy selected OmniStudio components
// app.post('/deploy', (req, res) => {
//     const { sourceAlias, targetAlias, selectedComponents } = req.body;

//     if (!sourceAlias || !targetAlias || typeof selectedComponents !== 'object') {
//         return res.status(400).send('sourceAlias, targetAlias, and selectedComponents {type: [name]} are required');
//     }

//     console.log(`Starting deployment from ${sourceAlias} to ${targetAlias}`);
//     console.log('Selected Components:', JSON.stringify(selectedComponents, null, 2));

//     try {
//         execSync(`npx  vlocity -sfdx.username ${sourceAlias} packUpdateSettings`, { stdio: 'inherit' });
//         execSync(`npx  vlocity -sfdx.username ${targetAlias} packUpdateSettings`, { stdio: 'inherit' });
//     } catch (err) {
//         console.error('Error updating settings:', err.message);
//     }

//     const tempDir = './vlocity-temp';
//     fs.rmSync(tempDir, { recursive: true, force: true });
//     fs.mkdirSync(tempDir, { recursive: true });

//     const deployYaml = {
//         projectPath: tempDir,
//         export: {}
//     };

//     for (const [type, items] of Object.entries(selectedComponents)) {
//         deployYaml.export[type] = {
//             queries: items.map(name => `${type}/${name}`)
//         };

//         items.forEach(name => {
//             const srcDir = path.join(type, name);
//             const destDir = path.join(tempDir, type, name);

//             if (fs.existsSync(srcDir)) {
//                 fs.mkdirSync(destDir, { recursive: true });
//                 fs.readdirSync(srcDir).forEach(file => {
//                     const srcFile = path.join(srcDir, file);
//                     const destFile = path.join(destDir, file);
//                     fs.copyFileSync(srcFile, destFile);
//                 });
//             }
//         });
//     }

//     const yamlPath = path.join(tempDir, 'deploySelected.yaml');
//     fs.writeFileSync(yamlPath, yaml.dump(deployYaml));

//     const deployCmd = `npx vlocity -sfdx.username ${targetAlias} packDeploy -job deploySelected.yaml --force --ignoreAllErrors --nojob`;

//     exec(deployCmd, { cwd: tempDir }, (err, stdout, stderr) => {
//         if (err) {
//             return res.status(500).send(`Deployment failed:\n${stderr || stdout}`);
//         }
//         res.send('Deployment successful!\n' + stdout);
//     });
// });

// app.listen(3000, () => {
//     console.log('Deployment API running at http://localhost:3000');
// });


const express = require('express');
const { exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const storage = require('./storageHelper');

const app = express();
app.use(express.json());

// GET all OmniStudio components (export full with dependencies)
app.get('/components', (req, res) => {
    const { sourceAlias } = req.query;
    if (!sourceAlias) return res.status(400).send('sourceAlias is required');

    const yamlContent = {
        export: {
            OmniScript: {},
            IntegrationProcedure: {},
            DataRaptor: {},
            FlexCard: {},
            OmniStudioAction: {},
            VlocityUITemplate: {},
            VlocityUILayout: {},
            CalculationMatrix: {},
            CalculationProcedure: {},
            OmniStudioTrackingService: {}
        },
        exportPacks: {
            autoAddDependentFields: true,
            autoAddDependencies: true
        }
    };

    fs.writeFileSync('exportAllOmni.yaml', yaml.dump(yamlContent));

    const exportCmd = `node ./node_modules/vlocity_build/vlocity.js -sfdx.username ${sourceAlias} packExport -job exportAllOmni.yaml --all`;

    console.log(`Exporting with command: ${exportCmd}`);

    exec(exportCmd, (err, stdout, stderr) => {
        console.log('Export STDOUT:\n', stdout);
        console.error('Export STDERR:\n', stderr);

        if (err) return res.status(500).send('Export failed');

        const omniScripts = fs.existsSync('./OmniScript') ? fs.readdirSync('./OmniScript').filter(entry =>
            fs.statSync(path.join('./OmniScript', entry)).isDirectory()) : [];

        const dataRaptors = fs.existsSync('./DataRaptor') ? fs.readdirSync('./DataRaptor').filter(entry =>
            fs.statSync(path.join('./DataRaptor', entry)).isDirectory()) : [];

        const summary = {
            timestamp: new Date().toISOString(),
            sourceAlias,
            OmniScript: omniScripts,
            DataRaptor: dataRaptors
        };

        storage.saveIndex(sourceAlias, summary);

        [...omniScripts.map(name => ['OmniScript', name]), ...dataRaptors.map(name => ['DataRaptor', name])]
            .forEach(([type, name]) => {
                const jsonPath = path.join(`./${type}/${name}`, `${name}_DataPack.json`);
                if (fs.existsSync(jsonPath)) {
                    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
                    storage.saveComponent(sourceAlias, type, name, data);
                }
            });

        res.json(summary);
    });
});

// GET stored components
app.get('/stored-components', (req, res) => {
    const { sourceAlias } = req.query;
    if (!sourceAlias) return res.status(400).send('sourceAlias is required');

    const index = storage.getIndex(sourceAlias);
    if (!index) return res.status(404).send('No stored components found');
    res.json(index);
});

// POST deploy
app.post('/deploy', (req, res) => {
    const { sourceAlias, targetAlias, selectedComponents } = req.body;

    if (!sourceAlias || !targetAlias || typeof selectedComponents !== 'object') {
        return res.status(400).send('sourceAlias, targetAlias, and selectedComponents {type: [name]} are required');
    }

    console.log(`Starting deployment from ${sourceAlias} to ${targetAlias}`);
    console.log('Selected Components:', JSON.stringify(selectedComponents, null, 2));

    try {
        execSync(`node ./node_modules/vlocity_build/vlocity.js -sfdx.username ${sourceAlias} packUpdateSettings`, { stdio: 'inherit' });
        execSync(`node ./node_modules/vlocity_build/vlocity.js -sfdx.username ${targetAlias} packUpdateSettings`, { stdio: 'inherit' });
    } catch (err) {
        console.error('Error updating settings:', err.message);
    }

    const tempDir = './vlocity-temp';
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.mkdirSync(tempDir, { recursive: true });

    const deployYaml = {
        export: {}
    };

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
                    const srcFile = path.join(srcDir, file);
                    const destFile = path.join(destDir, file);
                    fs.copyFileSync(srcFile, destFile);
                });
            }
        });
    }

    const yamlPath = path.join(tempDir, 'deploySelected.yaml');
    fs.writeFileSync(yamlPath, yaml.dump(deployYaml));

    const deployCmd = `node ./node_modules/vlocity_build/vlocity.js -sfdx.username ${targetAlias} packDeploy -job deploySelected.yaml --force --ignoreAllErrors --nojob`;

    exec(deployCmd, { cwd: tempDir }, (err, stdout, stderr) => {
        if (err) {
            return res.status(500).send(`Deployment failed:\n${stderr || stdout}`);
        }
        res.send('Deployment successful!\n' + stdout);
    });
});

app.listen(3000, () => {
    console.log('Deployment API running at http://localhost:3000');
});
