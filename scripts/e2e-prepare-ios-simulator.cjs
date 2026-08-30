const { appendFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');

const SIMULATOR_NAME = 'iPhone 17 Pro';

function runSimctl(args, options = {}) {
  const result = spawnSync('xcrun', ['simctl', ...args], {
    encoding: 'utf8',
    ...options,
  });

  if (result.error || result.status !== 0) {
    const detail = result.error?.message || result.stderr?.trim() || `exit ${result.status}`;
    throw new Error(`xcrun simctl ${args.join(' ')} failed: ${detail}`);
  }

  return result.stdout;
}

function findSimulator(simctlJson, name = SIMULATOR_NAME) {
  const runtimes = JSON.parse(simctlJson).devices ?? {};
  const matches = Object.values(runtimes)
    .flat()
    .filter(device => device.name === name && device.isAvailable !== false);

  return matches.find(device => device.state === 'Booted') ?? matches[0];
}

function prepareSimulator({ githubEnv = process.env.GITHUB_ENV } = {}) {
  const simulator = findSimulator(runSimctl(['list', 'devices', 'available', '-j']));
  if (!simulator) {
    throw new Error(`No available ${SIMULATOR_NAME} simulator was found.`);
  }

  if (simulator.state !== 'Booted') {
    runSimctl(['boot', simulator.udid]);
  }
  runSimctl(['bootstatus', simulator.udid, '-b'], {
    stdio: ['ignore', 'inherit', 'inherit'],
    timeout: 300000,
  });

  if (githubEnv) {
    appendFileSync(githubEnv, `DETOX_DEVICE_UDID=${simulator.udid}\n`);
  }

  process.stdout.write(`[e2e-simulator] ${SIMULATOR_NAME} ${simulator.udid} is booted and ready.\n`);
  return simulator.udid;
}

if (require.main === module) {
  try {
    prepareSimulator();
  } catch (error) {
    console.error(`[e2e-simulator] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { findSimulator, prepareSimulator, runSimctl };
