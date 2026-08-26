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

// expo-router requires EXPO_ROUTER_APP_ROOT so Metro can inline it as a
// string literal when bundling _ctx.ios.js during the expo-updates build
// phase.  Without it the require.context call fails with "Invalid call".
if (!process.env.EXPO_ROUTER_APP_ROOT) {
  process.env.EXPO_ROUTER_APP_ROOT = path.join(root, 'app');
}

const result = spawnSync('npx', ['detox', 'build', '-c', 'ios.sim.release'], {
  cwd: root,
  env: process.env,
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
