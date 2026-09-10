const fs = require('node:fs');
const path = require('node:path');

// Sets expo.version in app.json from a release tag (e.g. "v1.0.27" -> "1.0.27")
// so the built binary's marketing version (and appVersion runtime version)
// always matches the tag that triggered the release.
//
// Usage: node scripts/sync-app-version-from-tag.cjs [tag]
//   tag defaults to $GITHUB_REF_NAME. Leading "v" is stripped.
//   APP_JSON_PATH overrides the app.json location (used by tests).
//
// Exits non-zero when the tag is not X.Y.Z so tag builds fail fast instead
// of shipping a stale version.

function resolveVersion(rawTag) {
  const tag = String(rawTag || '').trim().replace(/^v/i, '');
  if (!/^\d+\.\d+\.\d+$/.test(tag)) {
    throw new Error(`refusing non-semver tag "${rawTag}" (expected vX.Y.Z)`);
  }
  return tag;
}

function syncAppVersion(appJsonPath, version) {
  const raw = fs.readFileSync(appJsonPath, 'utf8');
  const expoStart = raw.indexOf('"expo"');
  if (expoStart === -1) {
    throw new Error('could not find "expo" block in app.json');
  }

  const versionPattern = /("version"\s*:\s*")(\d+\.\d+\.\d+)(")/;
  const head = raw.slice(0, expoStart);
  const tail = raw.slice(expoStart);
  const match = versionPattern.exec(tail);
  if (!match) {
    throw new Error('could not find expo.version (X.Y.Z) in app.json');
  }

  if (match[2] === version) {
    console.log(`sync-app-version: already at ${version}, nothing to do.`);
    return false;
  }

  fs.writeFileSync(appJsonPath, head + tail.replace(match[0], `${match[1]}${version}${match[3]}`));
  console.log(`sync-app-version: ${match[2]} -> ${version}`);
  return true;
}

function replaceVersion(filePath, pattern, version, label) {
  if (!fs.existsSync(filePath)) return false;
  const raw = fs.readFileSync(filePath, 'utf8');
  const match = pattern.exec(raw);
  if (!match) throw new Error(`could not find ${label} in ${path.relative(path.dirname(filePath), filePath)}`);
  if (match[2] === version) return false;
  fs.writeFileSync(filePath, raw.replace(match[0], `${match[1]}${version}${match[3]}`));
  console.log(`sync-app-version: ${label} ${match[2]} -> ${version}`);
  return true;
}

function syncNativeVersions(root, version) {
  const targets = [
    [
      path.join(root, 'ios/Vasuli/Info.plist'),
      /(\<key\>CFBundleShortVersionString\<\/key\>\s*\<string\>)(\d+\.\d+\.\d+)(\<\/string\>)/,
      'iOS marketing version',
    ],
    [
      path.join(root, 'ios/Vasuli/Supporting/Expo.plist'),
      /(\<key\>EXUpdatesRuntimeVersion\<\/key\>\s*\<string\>)(\d+\.\d+\.\d+)(\<\/string\>)/,
      'iOS runtime version',
    ],
    [
      path.join(root, 'android/app/build.gradle'),
      /(versionName\s+")(\d+\.\d+\.\d+)(")/,
      'Android marketing version',
    ],
    [
      path.join(root, 'android/app/src/main/res/values/strings.xml'),
      /(\<string name="expo_runtime_version"\>)(\d+\.\d+\.\d+)(\<\/string\>)/,
      'Android runtime version',
    ],
  ];

  return targets.reduce(
    (changed, [filePath, pattern, label]) =>
      replaceVersion(filePath, pattern, version, label) || changed,
    false,
  );
}

function syncProjectVersions(root, version) {
  const appChanged = syncAppVersion(path.join(root, 'app.json'), version);
  const nativeChanged = syncNativeVersions(root, version);
  return appChanged || nativeChanged;
}

if (require.main === module) {
  const root = path.resolve(__dirname, '..');
  const tag = process.argv[2] || process.env.GITHUB_REF_NAME || '';
  try {
    const version = resolveVersion(tag);
    if (process.env.APP_JSON_PATH) {
      syncAppVersion(process.env.APP_JSON_PATH, version);
    } else {
      syncProjectVersions(root, version);
    }
  } catch (error) {
    console.error(`sync-app-version: ${(error && error.message) || error}`);
    process.exit(1);
  }
}

module.exports = { resolveVersion, syncAppVersion, syncNativeVersions, syncProjectVersions };
