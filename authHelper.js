const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

/**
 * Write JWT private key to a file (only if needed from env)
 */
function writeKeyToFile(keyContent, filePath) {
    if (!keyContent) {
        throw new Error('Private key content is undefined');
    }

    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, keyContent, { encoding: 'utf-8' });
        console.log(`[🔐] Wrote private key to ${filePath}`);
    }
}

/**
 * Authenticate with SFDX using JWT
 */
function authenticateWithJWT(alias, clientId, username, instanceUrl, privateKeyPathOrContent) {
    const keyPath = path.join('/tmp', `${alias}.key`);

    if (privateKeyPathOrContent.includes('BEGIN PRIVATE KEY')) {
        // It’s the actual key content — write to file
        writeKeyToFile(privateKeyPathOrContent, keyPath);
    } else {
        // Assume it's a path to an existing key file
        if (!fs.existsSync(privateKeyPathOrContent)) {
            throw new Error(`Private key file not found: ${privateKeyPathOrContent}`);
        }
        fs.copyFileSync(privateKeyPathOrContent, keyPath);
    }

    const command = `sfdx auth:jwt:grant \
      --client-id ${clientId} \
      --username ${username} \
      --instance-url ${instanceUrl} \
      --jwt-key-file ${keyPath} \
      --alias ${alias}`;

    console.log(`[🔐] Authenticating ${alias} (${username})...`);
    execSync(command, { stdio: 'inherit' });
}

module.exports = {
    authenticateWithJWT
};
