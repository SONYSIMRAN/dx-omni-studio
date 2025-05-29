const fs = require('fs');
const { execSync } = require('child_process');

function writeKeyToFile(base64Key, name) {
  const decoded = Buffer.from(base64Key, 'base64').toString('utf8');
  const path = `/tmp/${name}.key`;
  fs.writeFileSync(path, decoded);
  return path;
}

function authenticateWithJWT(alias, clientId, username, loginUrl, base64Key) {
  const keyPath = writeKeyToFile(base64Key, alias);
  const command = `sfdx auth:jwt:grant --clientid ${clientId} --username ${username} --instanceurl ${loginUrl} --jwtkeyfile ${keyPath} --setalias ${alias}`;
  console.log(`[🔐] Authenticating ${alias}...`);
  execSync(command, { stdio: 'inherit' });
}

module.exports = { authenticateWithJWT };
