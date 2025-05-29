const { execSync } = require('child_process');
const fs = require('fs');

function writeKeyToTemp(keyName, base64Key) {
  const filePath = `/tmp/${keyName}.key`;
  fs.writeFileSync(filePath, Buffer.from(base64Key, 'base64').toString('utf8'));
  return filePath;
}

function authenticateWithJWT(alias, clientId, username, loginUrl, base64Key) {
  const keyFilePath = writeKeyToTemp(alias, base64Key);
  const cmd = `sfdx auth:jwt:grant --client-id ${clientId} --username ${username} --instance-url ${loginUrl} --jwt-key-file ${keyFilePath} --alias ${alias}`;
  console.log(`[🔐] Authenticating ${alias}...`);
  execSync(cmd, { stdio: 'inherit' });
}

module.exports = { authenticateWithJWT };
