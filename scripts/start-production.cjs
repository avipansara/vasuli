const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');

try {
  const production = parseEnv(fs.readFileSync(path.join(root, '.env'), 'utf8'));
  if (!production.EXPO_PUBLIC_SUPABASE_URL || !production.EXPO_PUBLIC_SUPABASE_KEY) {
    throw new Error('.env must contain the production Supabase URL and publishable key.');
  }

  const host = new URL(production.EXPO_PUBLIC_SUPABASE_URL).hostname;
  const developmentFile = path.join(root, '.env.development.local');
  if (fs.existsSync(developmentFile)) {
    const development = parseEnv(fs.readFileSync(developmentFile, 'utf8'));
    if (development.EXPO_PUBLIC_SUPABASE_URL === production.EXPO_PUBLIC_SUPABASE_URL) {
      throw new Error('.env points to the development database. Set its production credentials first.');
    }
  }

  const env = { ...process.env };
  // Do not inherit development endpoints or test-account settings from the shell.
  for (const key of Object.keys(env)) {
    if (key.startsWith('EXPO_PUBLIC_')) delete env[key];
  }
  for (const [key, value] of Object.entries(production)) {
    if (key.startsWith('EXPO_PUBLIC_')) env[key] = value;
  }
  env.APP_ENV = 'production';
  env.EXPO_NO_DOTENV = '1';
  env.EXPO_NO_CLIENT_ENV_VARS = '0';
  env.VASULI_PRODUCTION_METRO = '1';
  env.REACT_NATIVE_PACKAGER_HOSTNAME = 'localhost';

  console.log(`[start:prod] Supabase: ${host} (from .env)`);
  console.log('[start:prod] Fast Refresh enabled; changes in the app affect production data.');
  if (!process.argv.includes('--check')) {
    // A separate port makes this server distinguishable from normal development.
    const result = spawnSync(process.execPath, [
      require.resolve('expo/bin/cli'), 'start', '--dev-client', '--clear',
      '--localhost', '--port', '8085', ...process.argv.slice(2),
    ], { cwd: root, env, stdio: 'inherit' });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? (result.signal === 'SIGINT' ? 130 : 1);
  }
} catch (error) {
  console.error(`[start:prod] ${error.message}`);
  process.exitCode = 1;
}
