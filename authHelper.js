// const { execSync } = require('child_process');
// const fs = require('fs');

// function writeKeyToTempFile(keyString, filename = 'server.key') {
//     const filePath = `/tmp/${filename}`;
//     fs.writeFileSync(filePath, keyString);
//     return filePath;
// }

// async function authenticateWithJWT(alias, clientId, username, loginUrl, jwtKey) {
//     const keyPath = writeKeyToTempFile(jwtKey);
//     const cmd = `sfdx auth:jwt:grant --clientid ${clientId} --username ${username} --jwtkeyfile ${keyPath} --instanceurl ${loginUrl} --setalias ${alias}`;
//     console.log(`Authenticating ${alias} using JWT...`);
//     execSync(cmd, { stdio: 'inherit' });
// }

// module.exports = { authenticateWithJWT };


const path = require('path');
const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');

function writeKeyToTempFile(keyString, filename = 'server.key') {
    const tempDir = os.tmpdir(); // Platform-specific temp directory
    const filePath = path.join(tempDir, filename);
    fs.writeFileSync(filePath, keyString);
    return filePath;
}

async function authenticateWithJWT(alias, clientId, username, loginUrl, jwtKey) {
    const keyPath = writeKeyToTempFile(jwtKey);
    const cmd = `sfdx auth:jwt:grant --clientid ${clientId} --username ${username} --jwtkeyfile "${keyPath}" --instanceurl ${loginUrl} --setalias ${alias}`;
    console.log(`Authenticating ${alias} using JWT...`);
    execSync(cmd, { stdio: 'inherit' });
}

module.exports = { authenticateWithJWT };
