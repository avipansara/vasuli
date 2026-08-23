import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The runner is intentionally CommonJS because it is invoked directly by npm.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { exitCode, measurementDirectory, runE2E, usesRunScopedFixtures } = require('../scripts/e2e-run.cjs') as {
  exitCode: (result: { status?: number | null; signal?: string | null }) => number;
  measurementDirectory: (scope?: string, baseDir?: string) => string;
  usesRunScopedFixtures: (args?: string[]) => boolean;
  runE2E: (options: {
    args?: string[];
    env?: Record<string, string>;
    runCommand?: (command: string, args: string[], env?: Record<string, string>) => { status: number; signal: string | null };
    now?: () => number;
    timingFile?: string;
  }) => number;
};

describe('e2e runner', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    tempDirs.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true }));
  });

  it('turns a terminating child into a non-zero signal exit code', () => {
    expect(exitCode({ status: null, signal: 'SIGTERM' })).toBe(143);
  });

  it('resolves a caller-selected measurement scope without allowing path traversal', () => {
    expect(measurementDirectory('ticket-02', '/tmp/measurements')).toBe('/tmp/measurements/ticket-02');
    expect(() => measurementDirectory('../outside', '/tmp/measurements')).toThrow(/Invalid E2E_MEASUREMENT_SCOPE/);
  });

  it('enables run-scoped fixtures for fixture-backed suites and deletion guards', () => {
    expect(usesRunScopedFixtures()).toBe(true);
    expect(usesRunScopedFixtures(['e2e/deletion-guards.test.js'])).toBe(true);
    expect(usesRunScopedFixtures(['e2e/split-methods.test.js'])).toBe(true);
    expect(usesRunScopedFixtures(['e2e/payer-selection.test.js'])).toBe(true);
    expect(usesRunScopedFixtures(['e2e/direct-expenses.test.js'])).toBe(true);
    expect(usesRunScopedFixtures(['e2e/friend-settle.test.js'])).toBe(true);
    expect(usesRunScopedFixtures(['e2e/settlement-reversal.test.js'])).toBe(true);
    expect(usesRunScopedFixtures(['e2e/auth.test.js'])).toBe(false);
    expect(usesRunScopedFixtures(['e2e/smoke.test.js'])).toBe(false);
  });

  it('always runs post-run cleanup after Detox fails and preserves the failure', () => {
    const calls: [string, string[]][] = [];
    const runCommand = vi.fn((command: string, args: string[]) => {
      calls.push([command, args]);
      if (args.includes('detox')) return { status: 17, signal: null };
      return { status: 0, signal: null };
    });

    const code = runE2E({
      env: { E2E_RUN_ID: 'test-run' },
      runCommand,
      now: (() => { let value = 0; return () => (value += 10); })(),
    });

    expect(code).toBe(17);
    expect(calls).toHaveLength(3);
    expect(calls[2][1]).toEqual(['scripts/e2e-cleanup.cjs', '--apply']);
  });

  it('runs post-run cleanup after Detox termination and returns the signal exit code', () => {
    const calls: [string, string[]][] = [];
    const runCommand = vi.fn((command: string, args: string[]) => {
      calls.push([command, args]);
      if (args.includes('detox')) return { status: null, signal: 'SIGTERM' };
      return { status: 0, signal: null };
    });

    const code = runE2E({ runCommand, now: (() => { let value = 0; return () => (value += 10); })() });

    expect(code).toBe(143);
    expect(calls).toHaveLength(3);
    expect(calls[2][1]).toEqual(['scripts/e2e-cleanup.cjs', '--apply']);
  });

  it('returns post-run cleanup failure after successful pre-cleanup and Detox', () => {
    const calls: [string, string[]][] = [];
    const runCommand = vi.fn((command: string, args: string[]) => {
      calls.push([command, args]);
      if (calls.length === 3) return { status: 23, signal: null };
      return { status: 0, signal: null };
    });

    const code = runE2E({ runCommand, now: (() => { let value = 0; return () => (value += 10); })() });

    expect(code).toBe(23);
    expect(calls).toHaveLength(3);
  });

  it('does not launch Detox after fixture cleanup fails and still reports cleanup failure', () => {
    const calls: [string, string[]][] = [];
    const runCommand = vi.fn((command: string, args: string[]) => {
      calls.push([command, args]);
      return { status: args.includes('detox') ? 0 : 9, signal: null };
    });

    const code = runE2E({ runCommand, now: (() => { let value = 0; return () => (value += 1); })() });

    expect(code).toBe(9);
    expect(calls).toHaveLength(2);
    expect(calls.every(([, args]) => args[0] !== 'detox')).toBe(true);
  });

  it('forwards a focused file and test name without invoking a build', () => {
    const calls: [string, string[]][] = [];
    const runCommand = vi.fn((command: string, args: string[]) => {
      calls.push([command, args]);
      return { status: 0, signal: null };
    });

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vasuli-e2e-runner-'));
    tempDirs.push(tempDir);
    const code = runE2E({
      args: ['e2e/auth.test.js', '--runInBand', '-t', 'signs in'],
      runCommand,
      timingFile: path.join(tempDir, 'timing.json'),
      now: (() => { let value = 0; return () => (value += 1); })(),
    });

    expect(code).toBe(0);
    expect(calls[1][0]).toBe('npx');
    expect(calls[1][1]).toEqual([
      'detox', 'test', '-c', 'ios.sim.release',
      'e2e/auth.test.js', '--runInBand', '-t', 'signs in',
    ]);
    expect(calls.map(([command]) => command)).not.toContain('scripts/e2e-build.cjs');
    expect(JSON.parse(fs.readFileSync(path.join(tempDir, 'timing.json'), 'utf8')).phases).toHaveLength(4);
  });

  it('keeps smoke out of the default full suite while including it for a focused run', () => {
    const environments: Record<string, string>[] = [];
    const runCommand = vi.fn((_command: string, _args: string[], env?: Record<string, string>) => {
      if (env) environments.push({ ...env });
      return { status: 0, signal: null };
    });

    runE2E({ args: [], runCommand, now: (() => { let value = 0; return () => (value += 1); })() });
    runE2E({ args: ['e2e/smoke.test.js'], runCommand, now: (() => { let value = 0; return () => (value += 1); })() });

    expect(environments[0].E2E_INCLUDE_SMOKE).toBe('0');
    expect(environments[3].E2E_INCLUDE_SMOKE).toBe('1');
  });

  it('marks fixture-backed focused runs for run-scoped cleanup while leaving unrelated runs legacy-scoped', () => {
    const environments: Record<string, string>[] = [];
    const runCommand = vi.fn((_command: string, args: string[], env?: Record<string, string>) => {
      if (env) environments.push({ ...env });
      return { status: 0, signal: null };
    });

    runE2E({ args: ['e2e/deletion-guards.test.js'], runCommand, now: (() => { let value = 0; return () => (value += 1); })() });
    runE2E({ args: ['e2e/payer-selection.test.js'], runCommand, now: (() => { let value = 0; return () => (value += 1); })() });
    runE2E({ args: ['e2e/auth.test.js'], runCommand, now: (() => { let value = 0; return () => (value += 1); })() });

    expect(environments[0].E2E_FIXTURE_MODE).toBe('1');
    expect(environments[2].E2E_FIXTURE_MODE).toBe('1');
    expect(environments[3].E2E_FIXTURE_MODE).toBe('1');
    expect(environments[6].E2E_FIXTURE_MODE).toBe('0');
    expect(environments[8].E2E_FIXTURE_MODE).toBe('0');
  });
});
