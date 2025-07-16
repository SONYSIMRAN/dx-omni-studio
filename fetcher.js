const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const storage = require('./storageHelper');

async function fetchComponents(sourceAlias) {
    const tempPath = path.join(__dirname, 'temp-components');
    const forceAppPath = path.join(tempPath, 'force-app');
    const retrievePath = path.join(tempPath, 'retrieved-metadata');

    // Cleanup
    fs.rmSync(tempPath, { recursive: true, force: true });
    fs.mkdirSync(tempPath, { recursive: true });
    fs.mkdirSync(path.join(forceAppPath, 'main', 'default'), { recursive: true });
    fs.mkdirSync(retrievePath, { recursive: true });

    // SFDX Project config
    const sfdxProjectJson = {
        packageDirectories: [{ path: 'force-app', default: true }],
        namespace: '',
        sourceApiVersion: '59.0'
    };
    fs.writeFileSync(
        path.join(tempPath, 'sfdx-project.json'),
        JSON.stringify(sfdxProjectJson, null, 2)
    );

    const summary = {
        OmniScript: [], FlexCard: [], IntegrationProcedure: [], DataRaptor: [],
        ApexClass: [], ApexTrigger: [], LightningComponentBundle: [], CustomObject: []
    };

    try {
        // Export OmniStudio metadata
        const exportCmd = `npx vlocity -sfdx.username ${sourceAlias} packExport -job exportAllOmni.yaml --all --ignoreAllErrors -projectPath ${tempPath}`;
        console.log('▶ Executing:', exportCmd);
        execSync(exportCmd, { stdio: 'inherit' });

        // Extract OmniStudio components
        ['OmniScript', 'FlexCard', 'IntegrationProcedure', 'DataRaptor'].forEach(type => {
            const typePath = path.join(tempPath, type);
            if (fs.existsSync(typePath)) {
                summary[type] = fs.readdirSync(typePath).map(name => path.parse(name).name);
            }
        });

        // Retrieve ApexClass, ApexTrigger, LWC using new CLI
        const retrieveCmd = `npx sf project retrieve start --metadata ApexClass,ApexTrigger,LightningComponentBundle --target-org ${sourceAlias} --output-dir "${retrievePath}"`;
        console.log('▶ Executing:', retrieveCmd);
        execSync(retrieveCmd, { cwd: tempPath, stdio: 'inherit' });

        // Parse retrieved SFDX components
        const sfdxTypes = {
            classes: 'ApexClass',
            triggers: 'ApexTrigger',
            lwc: 'LightningComponentBundle'
        };

        for (const [dir, label] of Object.entries(sfdxTypes)) {
            const typePath = path.join(retrievePath, dir);
            if (fs.existsSync(typePath)) {
                const files = fs.readdirSync(typePath);
                summary[label] = [...new Set(files.map(f => f.split('.')[0]))];
            }
        }

        // Save result
        storage.saveIndex(sourceAlias, summary);
        return summary;

    } catch (err) {
        console.error('❌ Component fetch failed:', err.message);
        throw new Error(err.message);
    }
}

module.exports = {
    fetchComponents
};
