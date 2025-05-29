const express = require('express');
const { exec, execSync } = require('child_process');
const { authenticateWithJWT } = require('./authHelper');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const storage = require('./storageHelper');

const app = express();
app.use(express.json());

const allTypes = [
    'OmniScript',
    'DataRaptor',
    'IntegrationProcedure',
    'FlexCard'
];

// Before any Vlocity calls:
// authenticateWithJWT(
//   'trial1',
//   process.env.SF_CLIENT_ID,
//   process.env.SF_USERNAME,
//   process.env.SF_LOGIN_URL,
//   process.env.SF_JWT_KEY
// );

// authenticateWithJWT(
//   'target',
//   process.env.TARGET_CLIENT_ID,
//   process.env.TARGET_USERNAME,
//   process.env.TARGET_LOGIN_URL,
//   process.env.TARGET_JWT_KEY
// );




// GET: Export and store OmniStudio components
app.get('/components', (req, res) => {
    const { sourceAlias } = req.query;
    if (!sourceAlias) return res.status(400).send('sourceAlias is required');

    const yamlContent = {
        export: {},
        exportPacks: {
            autoAddDependentFields: true,
            autoAddDependencies: true
        }
    };

    allTypes.forEach(type => {
        yamlContent.export[type] = {};
    });

    fs.writeFileSync('exportAllOmni.yaml', yaml.dump(yamlContent));

    const exportCmd = `npx vlocity -sfdx.username ${sourceAlias} packExport -job exportAllOmni.yaml --all --ignoreAllErrors`;
    console.log(`Exporting with command: ${exportCmd}`);

    exec(exportCmd, (err, stdout, stderr) => {
        console.log('Export STDOUT:\n', stdout);
        console.error('Export STDERR:\n', stderr);

        if (err) return res.status(500).send('Export failed');

        const summary = {
            timestamp: new Date().toISOString(),
            sourceAlias
        };

        allTypes.forEach(type => {
            const dir = `./${type}`;
            if (fs.existsSync(dir)) {
                const entries = fs.readdirSync(dir).filter(entry =>
                    fs.statSync(path.join(dir, entry)).isDirectory()
                );

                summary[type] = entries;

                entries.forEach(name => {
                    const jsonPath = path.join(dir, name, `${name}_DataPack.json`);
                    if (fs.existsSync(jsonPath)) {
                        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
                        storage.saveComponent(sourceAlias, type, name, data);
                    }
                });
            }
        });

        storage.saveIndex(sourceAlias, summary);
        res.json(summary);
    });
});

// GET: View stored components
app.get('/stored-components', (req, res) => {
    const { sourceAlias } = req.query;
    if (!sourceAlias) return res.status(400).send('sourceAlias is required');

    const index = storage.getIndex(sourceAlias);
    if (!index) return res.status(404).send('No stored components found');
    res.json(index);
});

// POST: Deploy selected components to target org
app.post('/deploy', (req, res) => {
    const { sourceAlias, targetAlias, selectedComponents } = req.body;
    if (!sourceAlias || !targetAlias || typeof selectedComponents !== 'object') {
        return res.status(400).send('sourceAlias, targetAlias, and selectedComponents {type: [name]} are required');
    }

    console.log(`Starting deployment from ${sourceAlias} to ${targetAlias}`);
    console.log('Selected Components:', JSON.stringify(selectedComponents, null, 2));

    const sourceUsername = process.env.SOURCE_USERNAME || sourceAlias;
    const targetUsername = process.env.TARGET_USERNAME || targetAlias;

    try {
        execSync(`npx vlocity -sfdx.username ${sourceUsername} packUpdateSettings`, { stdio: 'inherit' });
        execSync(`npx vlocity -sfdx.username ${targetUsername} packUpdateSettings`, { stdio: 'inherit' });
    } catch (err) {
        console.error('Error updating settings:', err.message);
        return res.status(500).send(`Settings update failed for one of the orgs: ${err.message}`);
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
                    fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
                });
            }
        });
    }

    const yamlPath = path.join(tempDir, 'deploySelected.yaml');
    fs.writeFileSync(yamlPath, yaml.dump(deployYaml));

    const deployCmd = `npx vlocity -sfdx.username ${targetUsername} packDeploy -job deploySelected.yaml --force --ignoreAllErrors --nojob`;

    exec(deployCmd, { cwd: tempDir }, (err, stdout, stderr) => {
        if (err) {
            return res.status(500).send(`Deployment failed:\n${stderr || stdout}`);
        }
        res.send('Deployment successful!\n' + stdout);
    });
});

// 🔄 /deploy API
// app.post('/deploy', (req, res) => {
//   const { sourceAlias, targetAlias, selectedComponents } = req.body;
//   if (!sourceAlias || !targetAlias || typeof selectedComponents !== 'object') {
//     return res.status(400).send('sourceAlias, targetAlias, and selectedComponents are required');
//   }

//   console.log(`[📦] Deploying from ${sourceAlias} to ${targetAlias}`);
//   console.log('[📦] Selected Components:', JSON.stringify(selectedComponents, null, 2));

//   try {
//     execSync(`npx vlocity -sfdx.username ${sourceAlias} packUpdateSettings`, { stdio: 'inherit' });
//     execSync(`npx vlocity -sfdx.username ${targetAlias} packUpdateSettings`, { stdio: 'inherit' });
//   } catch (err) {
//     console.error('[❌] packUpdateSettings failed:', err.message);
//     return res.status(500).send(`Settings update failed: ${err.message}`);
//   }

//   const tempDir = './vlocity-temp';
//   fs.rmSync(tempDir, { recursive: true, force: true });
//   fs.mkdirSync(tempDir, { recursive: true });

//   const deployYaml = { export: {} };
//   for (const [type, items] of Object.entries(selectedComponents)) {
//     deployYaml.export[type] = { queries: items.map(name => `${type}/${name}`) };
//     items.forEach(name => {
//       const srcDir = path.join(type, name);
//       const destDir = path.join(tempDir, type, name);
//       if (fs.existsSync(srcDir)) {
//         fs.mkdirSync(destDir, { recursive: true });
//         fs.readdirSync(srcDir).forEach(file => {
//           fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
//         });
//       }
//     });
//   }

//   const yamlPath = path.join(tempDir, 'deploySelected.yaml');
//   fs.writeFileSync(yamlPath, yaml.dump(deployYaml));

//   const deployCmd = `npx vlocity -sfdx.username ${targetAlias} packDeploy -job deploySelected.yaml --force --ignoreAllErrors --nojob`;

//   exec(deployCmd, { cwd: tempDir }, (err, stdout, stderr) => {
//     if (err) {
//       return res.status(500).send(`Deployment failed:\n${stderr || stdout}`);
//     }
//     res.send(`Deployment successful!\n${stdout}`);
//   });
// });


// Start server
app.listen(3000, () => {
    console.log('Deployment API running at http://localhost:3000');
});
