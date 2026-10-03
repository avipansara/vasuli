const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runWithCleanup } = require('./run-e2e-with-cleanup.cjs');

function loadEnvFile(filePath, overrideKeys = new Set()) {
  if (!fs.existsSync(filePath)) return {};
  const values = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key] = match;
    const value = match[2].replace(/^['"]|['"]$/g, '');
    values[key] = value;
    if (process.env[key] === undefined || overrideKeys.has(key)) process.env[key] = value;
  }
  return values;
}

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const values = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  return values;
}

const root = path.resolve(__dirname, '..');

function exitCode(result) {
  if (!result) return 1;
  if (typeof result.status === 'number') return result.status;
  if (result.signal) return 128 + (os.constants.signals[result.signal] ?? 1);
  return 1;
}

function run(command, args, env = process.env) {
  return spawnSync(command, args, { cwd: root, env, stdio: 'inherit' });
}

function runTesterArmy({
  args = process.argv.slice(2),
  env = process.env,
  runCommand = run,
} = {}) {
  // Listing and help are read-only CLI operations and need no account or app.
  if (args[0] === 'list' || args[0] === '--help' || args[0] === '-h') {
    return exitCode(runCommand(path.join(root, 'node_modules/.bin/e2e'), args, env));
  }

  const host = (() => {
    try { return new URL(env.EXPO_PUBLIC_SUPABASE_URL).hostname; } catch { return null; }
  })();
  if (!env.SUPABASE_DEV_HOST || !host || host !== env.SUPABASE_DEV_HOST) {
    console.error('[tester-army] Refusing to seed or clean fixtures without an exact development Supabase host match.');
    return 1;
  }

  const targetArgument = args.findIndex((arg) => arg === '--target');
  const targetValue = targetArgument >= 0 ? args[targetArgument + 1] : args.find((arg) => arg.startsWith('--target='))?.slice('--target='.length);
  const platforms = targetValue ? targetValue.split(',') : ['ios', 'android'];
  const appPaths = {
    ios: path.join(root, 'ios/build/Build/Products/Release-iphonesimulator/Vasuli.app'),
    android: path.join(root, 'android/app/build/outputs/apk/release/app-release.apk'),
  };
  for (const target of platforms) {
    if (!appPaths[target] || !fs.existsSync(appPaths[target])) {
      console.error(`[tester-army] ${target} simulator/emulator build is missing. Build the current development app before running device flows.`);
      return 1;
    }
  }

  const androidSdk = env.ANDROID_HOME || path.join(os.homedir(), 'Library/Android/sdk');
  if (fs.existsSync(androidSdk)) {
    const platformTools = path.join(androidSdk, 'platform-tools');
    const emulator = path.join(androidSdk, 'emulator');
    env.ANDROID_HOME ??= androidSdk;
    if (!env.PATH?.includes(platformTools)) {
      env.PATH = `${platformTools}:${emulator}:${env.PATH || ''}`;
    }
  }

  env.E2E_FIXTURE_MODE = '1';
  env.E2E_RUN_ID ??= `tester-${new Date().toISOString().replace(/[-:.TZ]/g, '')}-${process.pid}`;
  env.E2E_WORKER_ID ??= 'worker-0';
  env.E2E_CLEANUP_CONFIRM = 'delete';

  const cleanup = () => runCommand(process.execPath, ['scripts/e2e-cleanup.cjs', '--apply'], env);
  return runWithCleanup(
    cleanup,
    () => runCommand(path.join(root, 'node_modules/.bin/e2e'), ['run', ...args], env),
  );
}

if (require.main === module) {
  if (process.argv[2] === 'list' || process.argv[2] === '--help' || process.argv[2] === '-h') {
    process.exit(runTesterArmy());
  }
  const devEnv = loadEnvFile(path.join(root, '.env.development.local'), new Set([
    'EXPO_PUBLIC_SUPABASE_URL',
    'EXPO_PUBLIC_SUPABASE_KEY',
    'EXPO_PUBLIC_TEST_ACCOUNT_EMAIL',
    'EXPO_PUBLIC_TEST_ACCOUNT_OTP',
  ]));
  try {
    const trustedUrl = new URL(devEnv.EXPO_PUBLIC_SUPABASE_URL);
    process.env.SUPABASE_DEV_HOST = trustedUrl.hostname;
  } catch {
    console.error('[tester-army] EXPO_PUBLIC_SUPABASE_URL in .env.development.local is missing or invalid.');
    process.exit(1);
  }
  process.exit(runTesterArmy());
}

module.exports = {
  runTesterArmy,
};
