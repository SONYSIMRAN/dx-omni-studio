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
    'FlexCard',
    'VlocityCard__CardState__c',
    'VlocityUILayout',
    'VlocityUITemplate'
];

// =======================
// EXPORT COMPONENTS
// =======================
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
        if (err) return res.status(500).send('Export failed');
        console.log('Export STDOUT:\n', stdout);
        console.error('Export STDERR:\n', stderr);

        const summary = { timestamp: new Date().toISOString(), sourceAlias };

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

// =======================
// FETCH STORED COMPONENTS
// =======================
app.get('/stored-components', (req, res) => {
    const { sourceAlias } = req.query;
    if (!sourceAlias) return res.status(400).send('sourceAlias is required');

    const index = storage.getIndex(sourceAlias);
    if (!index) return res.status(404).send('No stored components found');
    res.json(index);
});

// =======================
// DEPLOY COMPONENTS
// =======================
app.post('/deploy', async (req, res) => {
    const { sourceAlias, targetAlias, selectedComponents } = req.body;
    if (!sourceAlias || !targetAlias || typeof selectedComponents !== 'object') {
        return res.status(400).send('sourceAlias, targetAlias, and selectedComponents {type: [name]} are required');
    }

    console.log(`Deploying from ${sourceAlias} to ${targetAlias}`);

    try {
        await authenticateWithJWT(sourceAlias, process.env.SF_CLIENT_ID, process.env.SF_USERNAME, process.env.SF_LOGIN_URL, process.env.SF_JWT_KEY);
        await authenticateWithJWT(targetAlias, process.env.TARGET_CLIENT_ID, process.env.TARGET_USERNAME, process.env.TARGET_LOGIN_URL, process.env.TARGET_JWT_KEY);
    } catch (err) {
        return res.status(500).json({ status: 'error', message: 'JWT auth failed', details: err.message });
    }

    try {
        execSync(`npx vlocity -sfdx.username ${sourceAlias} packUpdateSettings`, { stdio: 'inherit' });
        execSync(`npx vlocity -sfdx.username ${targetAlias} packUpdateSettings`, { stdio: 'inherit' });
    } catch (err) {
        return res.status(500).json({ status: 'error', message: 'Settings update failed', details: err.message });
    }

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

    fs.writeFileSync(path.join(tempDir, 'deploySelected.yaml'), yaml.dump(deployYaml));
    const stripAnsi = (await import('strip-ansi')).default;
    const deployCmd = `npx vlocity -sfdx.username ${targetAlias} packDeploy -job deploySelected.yaml --force --ignoreAllErrors --nojob`;

    exec(deployCmd, { cwd: tempDir }, (err, stdout, stderr) => {
        const rawOutput = stdout || stderr || '';
        const cleanOutput = stripAnsi(rawOutput);
        const deployedComponents = [];
        const warnings = [];
        let elapsedTime = '';

        cleanOutput.split('\n').forEach(line => {
            if (line.includes('Adding to Deploy >>')) deployedComponents.push(line.split('>>')[1]?.trim());
            if (line.includes('Elapsed Time')) elapsedTime = line.split('>>')[1]?.trim();
            if (line.toLowerCase().includes('unauthorized') || line.toLowerCase().includes('error')) warnings.push(line.trim());
        });

        // ✅ FlexCard Activation
        if (!err) {
            deployedComponents.forEach(name => {
                if (name.startsWith('FlexCard/')) {
                    const cardName = name.split('/')[1];
                    const activateCmd = `npx vlocity -sfdx.username ${targetAlias} flexcards.activate --name "${cardName}"`;
                    try {
                        execSync(activateCmd, { stdio: 'inherit' });
                    } catch (e) {
                        warnings.push(`Activation failed for ${cardName}: ${e.message}`);
                    }
                }
            });
        }

        // ✅ Optional global packActivate
        try {
            const activateAllCmd = `npx vlocity -sfdx.username ${targetAlias} packActivate -job deploySelected.yaml`;
            execSync(activateAllCmd, { cwd: tempDir, stdio: 'inherit' });
        } catch (e) {
            warnings.push('Global activation failed: ' + e.message);
        }

        return res.status(err ? 500 : 200).json({
            status: err ? 'error' : 'success',
            message: err ? 'Deployment failed' : 'Deployment successful',
            deployedComponents,
            elapsedTime,
            warnings,
            details: cleanOutput
        });
    });
});

// =======================
// START SERVER
// =======================
app.listen(3000, () => {
    console.log('Deployment API running at http://localhost:3000');
});
