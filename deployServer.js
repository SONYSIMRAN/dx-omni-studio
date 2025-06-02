const express = require('express');
const { exec, execSync } = require('child_process');
const { authenticateWithJWT } = require('./authHelper');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const storage = require('./storageHelper');
// const stripAnsi = require('strip-ansi');

const app = express();
app.use(express.json());

const allTypes = [
    'OmniScript',
    'DataRaptor',
    'IntegrationProcedure',
    'FlexCard',
    'VlocityCard__CardState__c'
];

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
// app.post('/deploy', (req, res) => {
//     const { sourceAlias, targetAlias, selectedComponents } = req.body;
//     if (!sourceAlias || !targetAlias || typeof selectedComponents !== 'object') {
//         return res.status(400).send('sourceAlias, targetAlias, and selectedComponents {type: [name]} are required');
//     }

//     console.log(`Starting deployment from ${sourceAlias} to ${targetAlias}`);
//     console.log('Selected Components:', JSON.stringify(selectedComponents, null, 2));

//     // const sourceUsername = process.env.SOURCE_USERNAME || sourceAlias;
//     // const targetUsername = process.env.TARGET_USERNAME || targetAlias;
//     // const targetUsername = targetAlias; 

//     try {
//         execSync(`npx vlocity -sfdx.username ${sourceAlias} packUpdateSettings`, { stdio: 'inherit' });
//         execSync(`npx vlocity -sfdx.username ${targetAlias} packUpdateSettings`, { stdio: 'inherit' });
//     } catch (err) {
//         console.error('Error updating settings:', err.message);
//         return res.status(500).send(`Settings update failed for one of the orgs: ${err.message}`);
//     }

//     const tempDir = './vlocity-temp';
//     fs.rmSync(tempDir, { recursive: true, force: true });
//     fs.mkdirSync(tempDir, { recursive: true });

//     const deployYaml = {
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
//                     fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
//                 });
//             }
//         });
//     }

//     const yamlPath = path.join(tempDir, 'deploySelected.yaml');
//     fs.writeFileSync(yamlPath, yaml.dump(deployYaml));

//     //const deployCmd = `npx vlocity -sfdx.username ${targetUsername} packDeploy -job deploySelected.yaml --force --ignoreAllErrors --nojob`;
//     const deployCmd = `npx vlocity -sfdx.username ${targetAlias} packDeploy -job deploySelected.yaml --force --ignoreAllErrors --nojob`;

//     exec(deployCmd, { cwd: tempDir }, (err, stdout, stderr) => {
//         if (err) {
//             return res.status(500).send(`Deployment failed:\n${stderr || stdout}`);
//         }
//         res.send('Deployment successful!\n' + stdout);
//     });
// });


// POST: Deploy selected components to target org
// app.post('/deploy', async (req, res) => {
//     const { sourceAlias, targetAlias, selectedComponents } = req.body;
//     if (!sourceAlias || !targetAlias || typeof selectedComponents !== 'object') {
//         return res.status(400).send('sourceAlias, targetAlias, and selectedComponents {type: [name]} are required');
//     }

//     console.log(`Starting deployment from ${sourceAlias} to ${targetAlias}`);
//     console.log('Selected Components:', JSON.stringify(selectedComponents, null, 2));

//     // Authenticate source and target using JWT
//     try {
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
//     } catch (err) {
//         console.error('JWT authentication failed:', err.message);
//         return res.status(500).send(`JWT auth failed: ${err.message}`);
//     }

//     // Run packUpdateSettings on both
//     try {
//         execSync(`npx vlocity -sfdx.username ${sourceAlias} packUpdateSettings`, { stdio: 'inherit' });
//         execSync(`npx vlocity -sfdx.username ${targetAlias} packUpdateSettings`, { stdio: 'inherit' });
//     } catch (err) {
//         console.error('Error updating settings:', err.message);
//         return res.status(500).send(`Settings update failed for one of the orgs: ${err.message}`);
//     }

//     const tempDir = './vlocity-temp';
//     fs.rmSync(tempDir, { recursive: true, force: true });
//     fs.mkdirSync(tempDir, { recursive: true });

//     const deployYaml = { export: {} };
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
//                     fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
//                 });
//             }
//         });
//     }

//     const yamlPath = path.join(tempDir, 'deploySelected.yaml');
//     fs.writeFileSync(yamlPath, yaml.dump(deployYaml));
//     // dynamic import
//     // const stripAnsi = (await import('strip-ansi')).default;

//     const deployCmd = `npx vlocity -sfdx.username ${targetAlias} packDeploy -job deploySelected.yaml --force --ignoreAllErrors --nojob`;

//     // exec(deployCmd, { cwd: tempDir }, (err, stdout, stderr) => {
//     //     if (err) {
//     //         return res.status(500).send(`Deployment failed:\n${stderr || stdout}`);
//     //     }
//     //     res.send('Deployment successful!\n' + stdout);
//     // });
//     //Dynamic import to avoid ESM error
//     // const stripAnsi = (await import('strip-ansi')).default;

//     // exec(deployCmd, { cwd: tempDir }, (err, stdout, stderr) => {
//     //     const rawOutput = stdout || stderr || '';
//     //     const cleanOutput = stripAnsi(rawOutput);
//     //     const maxLength = 4000;

//     //     const trimmedOutput = cleanOutput.length > maxLength
//     //         ? cleanOutput.substring(0, maxLength) + '\n... (truncated)'
//     //         : cleanOutput;

//     //     if (err) {
//     //         return res.status(500).json({
//     //             status: 'error',
//     //             message: 'Deployment failed',
//     //             details: trimmedOutput
//     //         });
//     //     }

//     //     res.json({
//     //         status: 'success',
//     //         message: 'Deployment successful',
//     //         details: trimmedOutput
//     //     });
//     // });
//     const stripAnsi = (await import('strip-ansi')).default;

// exec(deployCmd, { cwd: tempDir }, (err, stdout, stderr) => {
//     const rawOutput = stdout || stderr || '';
//     const cleanOutput = stripAnsi(rawOutput);

//     const deployedComponents = [];
//     const lines = cleanOutput.split('\n');

//     let elapsedTime = '';
//     let warnings = [];

//     lines.forEach(line => {
//         if (line.includes('Adding to Deploy >>')) {
//             deployedComponents.push(line.split('>>')[1].trim());
//         }
//         if (line.includes('Elapsed Time')) {
//             elapsedTime = line.split('>>')[1].trim();
//         }
//         if (line.includes('Error') || line.includes('Unauthorized')) {
//             warnings.push(line.trim());
//         }
//     });

//     const response = {
//         status: err ? 'error' : 'success',
//         message: err ? 'Deployment failed' : 'Deployment successful',
//         deployedComponents,
//         elapsedTime,
//         warnings,
//         details: cleanOutput  // for logs
//     };

//     const code = err ? 500 : 200;
//     res.status(code).json(response);
// });

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

    // ✅ Import strip-ansi dynamically (ESM compatibility)
    const stripAnsi = (await import('strip-ansi')).default;
    const deployCmd = `npx vlocity -sfdx.username ${targetAlias} packDeploy -job deploySelected.yaml --force --ignoreAllErrors --nojob`;

    exec(deployCmd, { cwd: tempDir }, (err, stdout, stderr) => {
        const rawOutput = stdout || stderr || '';
        const cleanOutput = stripAnsi(rawOutput);

        // Parse the output for key info
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

            if (line.toLowerCase().includes('unauthorized') || line.toLowerCase().includes('error')) {
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


// Start server
app.listen(3000, () => {
    console.log('Deployment API running at http://localhost:3000');
});