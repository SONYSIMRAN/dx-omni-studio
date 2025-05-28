const express = require('express');
const { exec, execSync } = require('child_process');
const fs = require('fs');
const { getSupportedOmniTypes } = require('./dxUtils');
const path = require('path');
const yaml = require('js-yaml');
const storage = require('./storageHelper');

const app = express();
app.use(express.json());

// Supported OmniStudio Types (safe for most orgs)
const allTypes = [
    'OmniScript',
    'DataRaptor',
    'IntegrationProcedure',
    'FlexCard',
    // 'VlocityUITemplate',
    // 'VlocityUILayout',
    // 'OmniStudioAction',
    // 'CalculationProcedure',
    // 'CalculationMatrix',
    // 'OmniStudioTrackingService'
];
// const allTypes = getSupportedOmniTypes(sourceAlias);

//GET: Export and Store OmniStudio Components
app.get('/components', (req, res) => {
    const { sourceAlias } = req.query;
    if (!sourceAlias) return res.status(400).send('sourceAlias is required');

    // Moved here so sourceAlias is defined
    // const allTypes = getSupportedOmniTypes(sourceAlias);

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


// GET: View Stored Components
app.get('/stored-components', (req, res) => {
    const { sourceAlias } = req.query;
    if (!sourceAlias) return res.status(400).send('sourceAlias is required');

    const index = storage.getIndex(sourceAlias);
    if (!index) return res.status(404).send('No stored components found');
    res.json(index);
});

// POST: Deploy Selected Components to Target
app.post('/deploy', (req, res) => {
    const { sourceAlias, targetAlias, selectedComponents } = req.body;
    if (!sourceAlias || !targetAlias || typeof selectedComponents !== 'object') {
        return res.status(400).send('sourceAlias, targetAlias, and selectedComponents {type: [name]} are required');
    }

    console.log(`Starting deployment from ${sourceAlias} to ${targetAlias}`);
    console.log('Selected Components:', JSON.stringify(selectedComponents, null, 2));
    try {
        const sourceUsername = process.env.SOURCE_USERNAME || sourceAlias;
        const targetUsername = process.env.TARGET_USERNAME || target1;

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

    // const deployCmd = `npx vlocity -sfdx.username ${targetAlias} packDeploy -job deploySelected.yaml --force --ignoreAllErrors --nojob`;
    const targetUsername = process.env.TARGET_USERNAME || targetAlias;
    const deployCmd = `npx vlocity -sfdx.username ${targetUsername} packDeploy -job deploySelected.yaml --force --ignoreAllErrors --nojob`;



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
