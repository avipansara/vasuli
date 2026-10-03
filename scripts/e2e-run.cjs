const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

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
  return result.error ? 1 : 1;
}

function run(command, args, env = process.env) {
  return spawnSync(command, args, { cwd: root, env, stdio: 'inherit' });
}

function formatDuration(durationMs) {
  return `${(durationMs / 1000).toFixed(3)}s`;
}

function writeTimingArtifact(filePath, artifact) {
  if (!filePath) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(artifact, null, 2)}\n`);
}

function measurementDirectory(scope = process.env.E2E_MEASUREMENT_SCOPE ?? 'ticket-01', baseDir = path.join(root, '.scratch/detox-e2e-performance/measurements')) {
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(scope)) {
    throw new Error(`Invalid E2E_MEASUREMENT_SCOPE: ${scope}`);
  }
  return path.join(baseDir, scope);
}

function usesRunScopedFixtures(args = []) {
  if (args.length === 0) return true;
  return args.some((arg) => /(?:^|[/\\])(?:activity-balances|deletion-guards|direct-expenses|split-methods|payer-selection|recurring-expense-creation|friend-settle|settlement-reversal)\.test\.js$/.test(arg));
}

function runE2E({
  args = process.argv.slice(2),
  env = process.env,
  runCommand = run,
  now = () => performance.now(),
  timingFile = env.E2E_TIMING_FILE,
} = {}) {
  const startedAt = now();
  const phase = (name, start, end, status) => ({
    name,
    durationMs: Math.max(0, end - start),
    status,
  });
  const runId = env.E2E_RUN_ID ?? `runner-${new Date().toISOString().replace(/[-:.TZ]/g, '')}-${process.pid}`;
  env.E2E_FIXTURE_MODE = usesRunScopedFixtures(args) ? '1' : '0';
  env.E2E_INCLUDE_SMOKE = args.some((arg) => /(?:^|[/\\])smoke\.test\.js$/.test(arg)) ? '1' : '0';
  const timings = { runId, startedAt: new Date().toISOString(), phases: [], tests: [] };

  const beforeStart = now();
  const before = runCommand(process.execPath, ['scripts/e2e-cleanup.cjs', '--apply'], env);
  const beforeEnd = now();
  timings.phases.push(phase('pre-run cleanup', beforeStart, beforeEnd, exitCode(before)));

  let detox;
  let detoxStart;
  let detoxEnd;
  if (exitCode(before) === 0) {
    detoxStart = now();
    env.E2E_DETOX_LAUNCH_AT = String(Date.now());
    detox = runCommand('npx', ['detox', 'test', '-c', 'ios.sim.release', ...args], env);
    detoxEnd = now();
    timings.phases.push(phase('Detox startup and Jest execution', detoxStart, detoxEnd, exitCode(detox)));
  }

  const afterStart = now();
  const after = runCommand(process.execPath, ['scripts/e2e-cleanup.cjs', '--apply'], env);
  const afterEnd = now();
  timings.phases.push(phase('post-run cleanup', afterStart, afterEnd, exitCode(after)));

  if (timingFile && fs.existsSync(timingFile)) {
    try {
      const testArtifact = JSON.parse(fs.readFileSync(timingFile, 'utf8'));
      timings.tests = testArtifact.tests ?? [];
      timings.jest = testArtifact.jest;
      if (timings.jest?.startedAtEpoch && env.E2E_DETOX_LAUNCH_AT) {
        const startupMs = timings.jest.startedAtEpoch - Number(env.E2E_DETOX_LAUNCH_AT);
        timings.phases.push({ name: 'Detox startup and simulator allocation', durationMs: startupMs, status: 0 });
        console.log(`[e2e-timing] Detox startup and simulator allocation: ${formatDuration(startupMs)}`);
        console.log(`[e2e-timing] total Jest execution: ${formatDuration(timings.jest.durationMs)}`);
      }
    } catch (error) {
      console.warn(`[e2e-run] Could not read test timing artifact: ${error.message}`);
    }
  }

  const finishedAt = now();
  timings.totalDurationMs = Math.max(0, finishedAt - startedAt);
  timings.phases.push(phase('total wrapper execution', startedAt, finishedAt,
    exitCode(before) || exitCode(detox) || exitCode(after)));
  writeTimingArtifact(timingFile, timings);
  timings.phases.forEach(({ name, durationMs, status }) => {
    console.log(`[e2e-timing] ${name}: ${formatDuration(durationMs)} (exit ${status})`);
  });

  return exitCode(before) || exitCode(detox) || exitCode(after);
}

if (require.main === module) {
  const devEnv = loadEnvFile(path.join(root, '.env.development.local'), new Set([
    'EXPO_PUBLIC_SUPABASE_URL',
    'EXPO_PUBLIC_SUPABASE_KEY',
  ]));
  try {
    const devHost = new URL(devEnv.EXPO_PUBLIC_SUPABASE_URL).hostname;
    process.env.SUPABASE_DEV_HOST = devHost;
    const baseEnvPath = path.join(root, '.env');
    if (fs.existsSync(baseEnvPath)) {
      const baseEnv = readEnvFile(baseEnvPath);
      const baseHost = baseEnv.EXPO_PUBLIC_SUPABASE_URL
        ? new URL(baseEnv.EXPO_PUBLIC_SUPABASE_URL).hostname
        : null;
      if (baseHost && baseHost === devHost) {
        throw new Error('The development Supabase host must differ from the base environment host.');
      }
    }
  } catch (error) {
    console.error(`[e2e-run] ${error.message ?? 'Invalid development Supabase configuration.'}`);
    process.exit(1);
  }
  process.env.E2E_CLEANUP_CONFIRM = 'delete';
  const measurementDir = measurementDirectory();
  process.env.E2E_RUN_ID ??= `run-${new Date().toISOString().replace(/[-:.TZ]/g, '')}-${process.pid}`;
  process.env.E2E_WORKER_ID ??= 'worker-0';
  process.env.E2E_TIMING_FILE ??= path.join(measurementDir, `${process.env.E2E_RUN_ID}.json`);
  process.exit(runE2E({ timingFile: process.env.E2E_TIMING_FILE }));
}

module.exports = { exitCode, formatDuration, measurementDirectory, runE2E, usesRunScopedFixtures, writeTimingArtifact };
