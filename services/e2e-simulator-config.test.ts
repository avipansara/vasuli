import { afterEach, describe, expect, it, vi } from 'vitest';

// The CI simulator helper is CommonJS because workflows execute it with Node.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { findSimulator } = require('../scripts/e2e-prepare-ios-simulator.cjs') as {
  findSimulator: (simctlJson: string) => { state: string; udid: string } | undefined;
};

describe('Detox iOS simulator configuration', () => {
  const originalUdid = process.env.DETOX_DEVICE_UDID;

  afterEach(() => {
    if (originalUdid === undefined) {
      delete process.env.DETOX_DEVICE_UDID;
    } else {
      process.env.DETOX_DEVICE_UDID = originalUdid;
    }
    vi.resetModules();
  });

  it('pins Detox to the simulator prepared by CI', async () => {
    process.env.DETOX_DEVICE_UDID = 'CI-SIMULATOR-UDID';
    const config = await import('../.detoxrc.js');

    expect(config.default.devices.simulator.device).toEqual({ id: 'CI-SIMULATOR-UDID' });
  });

  it('keeps model-based selection for local runs', async () => {
    delete process.env.DETOX_DEVICE_UDID;
    const config = await import('../.detoxrc.js');

    expect(config.default.devices.simulator.device).toEqual({ type: 'iPhone 17 Pro' });
  });

  it('reuses a booted matching simulator instead of selecting a cold device', () => {
    const simctlJson = JSON.stringify({
      devices: {
        'com.apple.CoreSimulator.SimRuntime.iOS-26-0': [
          { isAvailable: true, name: 'iPhone 17 Pro', state: 'Shutdown', udid: 'COLD-UDID' },
          { isAvailable: true, name: 'iPhone 17 Pro', state: 'Booted', udid: 'READY-UDID' },
          { isAvailable: true, name: 'iPhone 17', state: 'Booted', udid: 'WRONG-MODEL' },
        ],
      },
    });

    expect(findSimulator(simctlJson)).toMatchObject({ state: 'Booted', udid: 'READY-UDID' });
  });
});
