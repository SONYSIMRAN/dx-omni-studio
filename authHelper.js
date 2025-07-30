const path = require('path');
const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');

/**
 * Writes the key to a temp file if it's a raw string.
 * If it's already a file path, just return the absolute path.
 */
function getKeyInput(value) {
    const trimmed = value.trim();
    if (trimmed.startsWith('-----BEGIN')) {
        const tempDir = os.tmpdir();
        const filePath = path.join(tempDir, 'server.key');
        fs.writeFileSync(filePath, trimmed);
        return filePath;
    } else {
        return path.resolve(__dirname, trimmed);
    }
}

/**
 * Authenticates using JWT-based flow.
 */
// async function authenticateWithJWT(alias, clientId, username, loginUrl, jwtKey) {
//     const keyPath = getKeyInput(jwtKey);
//     const normalizedKeyPath = path.normalize(keyPath);

//     const cmd = `sfdx auth:jwt:grant --client-id ${clientId} --username ${username} --jwt-key-file "${normalizedKeyPath}" --instance-url ${loginUrl} --alias ${alias}`;
//     console.log(`🔐 Authenticating ${alias} using JWT...`);
//     console.log(`Running command: ${cmd}`);

//     execSync(cmd, { stdio: 'inherit' });
// }

async function authenticateWithJWT(alias, clientId, username, loginUrl, jwtKey) {
    const keyPath = getKeyInput(jwtKey);
    const normalizedKeyPath = path.normalize(keyPath);

    // Fallback if loginUrl is missing
    const instanceUrl = loginUrl || 'https://login.salesforce.com';
    if (!clientId || !username || !jwtKey) {
        throw new Error('Missing one of: clientId, username, jwtKey');
    }

    const cmd = `sfdx auth:jwt:grant \
        --client-id "${clientId}" \
        --username "${username}" \
        --jwt-key-file "${normalizedKeyPath}" \
        --instance-url "${instanceUrl}" \
        --alias "${alias}"`;

    console.log(`🔐 Authenticating ${alias} using JWT...`);
    console.log(`Running command: ${cmd}`);

    execSync(cmd, { stdio: 'inherit' });
}


module.exports = { authenticateWithJWT };
