const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function loadEnvFile(filePath, overrideKeys = new Set()) {
  if (!fs.existsSync(filePath)) return;
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
process.env.E2E_CLEANUP_CONFIRM = 'delete';

function run(command, args) {
  return spawnSync(command, args, { cwd: root, env: process.env, stdio: 'inherit' });
}

const before = run(process.execPath, ['scripts/e2e-cleanup.cjs', '--apply']);
if (before.status !== 0) process.exit(before.status ?? 1);

const detox = run('npx', ['detox', 'test', '-c', 'ios.sim.release', ...process.argv.slice(2)]);
const after = run(process.execPath, ['scripts/e2e-cleanup.cjs', '--apply']);

process.exit(detox.status ?? after.status ?? 1);
