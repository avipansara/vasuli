const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const appJsonPath = path.join(root, 'app.json');

const raw = fs.readFileSync(appJsonPath, 'utf8');
const expoStart = raw.indexOf('"expo"');
if (expoStart === -1) {
  console.error('bump-app-version: could not find "expo" block in app.json');
  process.exit(1);
}

const versionPattern = /("version"\s*:\s*")(\d+)\.(\d+)\.(\d+)(")/;
const match = versionPattern.exec(raw.slice(expoStart));
if (!match) {
  console.error('bump-app-version: could not find expo.version (X.Y.Z) in app.json');
  process.exit(1);
}

const [full, prefix, major, minor, patch, suffix] = match;
const nextVersion = `${major}.${minor}.${Number(patch) + 1}`;
const next = `${prefix}${nextVersion}${suffix}`;
fs.writeFileSync(appJsonPath, raw.slice(0, expoStart) + raw.slice(expoStart).replace(full, next));

console.log(`bump-app-version: ${major}.${minor}.${patch} -> ${nextVersion}`);
