const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function loadEnvFile(filePath, overrideKeys = new Set()) {
  if (!fs.existsSync(filePath)) return {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || (process.env[match[1]] !== undefined && !overrideKeys.has(match[1]))) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

const root = path.resolve(__dirname, '..');
loadEnvFile(path.join(root, '.env.development.local'), new Set([
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_KEY',
]));

// The base .env may contain production PostHog values. E2E simulator binaries
// talk to the development database only and must never emit product events.
process.env.APP_ENV = 'development';
process.env.EXPO_PUBLIC_APP_ENV = 'development';
process.env.EXPO_PUBLIC_POSTHOG_ENABLED = 'false';
process.env.EXPO_PUBLIC_POSTHOG_API_KEY = '';
process.env.EXPO_PUBLIC_POSTHOG_HOST = '';

// expo-router requires EXPO_ROUTER_APP_ROOT so Metro can inline it as a
// string literal when bundling _ctx.ios.js during the expo-updates build
// phase. Without it the require.context call fails with "Invalid call".
if (!process.env.EXPO_ROUTER_APP_ROOT) {
  process.env.EXPO_ROUTER_APP_ROOT = path.join(root, 'app');
}

const platform = process.env.E2E_PLATFORM || 'ios';

let result;
if (platform === 'ios') {
  result = spawnSync('xcodebuild', [
    '-workspace', 'ios/Vasuli.xcworkspace',
    '-scheme', 'Vasuli',
    '-configuration', 'Release',
    '-sdk', 'iphonesimulator',
    '-derivedDataPath', 'ios/build',
  ], {
    cwd: root,
    env: { ...process.env, EXPO_ROUTER_APP_ROOT: process.env.EXPO_ROUTER_APP_ROOT },
    stdio: 'inherit',
  });
} else if (platform === 'android') {
  const androidSdk = process.env.ANDROID_HOME || path.join(os.homedir(), 'Library/Android/sdk');
  if (fs.existsSync(androidSdk)) {
    process.env.ANDROID_HOME ??= androidSdk;
    process.env.ANDROID_SDK_ROOT ??= androidSdk;
  }
  const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
  result = spawnSync(gradlew, ['assembleRelease'], {
    cwd: path.join(root, 'android'),
    env: process.env,
    stdio: 'inherit',
  });
} else {
  console.error(`[e2e-build] Unsupported E2E_PLATFORM: ${platform}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
