const { execSync } = require('child_process');
const fs = require('fs');

function writeKeyToTempFile(keyString, filename = 'server.key') {
    const filePath = `/tmp/${filename}`;
    fs.writeFileSync(filePath, keyString);
    return filePath;
}

async function authenticateWithJWT(alias, clientId, username, loginUrl, jwtKey) {
    const keyPath = writeKeyToTempFile(jwtKey);
    const cmd = `sfdx auth:jwt:grant --clientid ${clientId} --username ${username} --jwtkeyfile ${keyPath} --instanceurl ${loginUrl} --setalias ${alias}`;
    console.log(`[🔐] Authenticating ${alias} using JWT...`);
    execSync(cmd, { stdio: 'inherit' });
}

module.exports = { authenticateWithJWT };
