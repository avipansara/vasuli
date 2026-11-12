import { describe, expect, it } from 'vitest';

// The CI simulator helper is CommonJS because workflows execute it with Node.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { findSimulator } = require('../scripts/e2e-prepare-ios-simulator.cjs') as {
  findSimulator: (simctlJson: string) => { state: string; udid: string } | undefined;
};

describe('iOS simulator preparation', () => {
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

  it('selects the first available simulator when none are booted', () => {
    const simctlJson = JSON.stringify({
      devices: {
        'com.apple.CoreSimulator.SimRuntime.iOS-26-0': [
          { isAvailable: true, name: 'iPhone 17 Pro', state: 'Shutdown', udid: 'COLD-UDID' },
        ],
      },
    });

    expect(findSimulator(simctlJson)).toMatchObject({ state: 'Shutdown', udid: 'COLD-UDID' });
  });
});
