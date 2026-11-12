import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { runTesterArmy } = require('./tester-army-run.cjs') as {
  runTesterArmy: (options: Record<string, unknown>) => number;
};
const { runWithCleanup } = require('./run-e2e-with-cleanup.cjs') as {
  runWithCleanup: (cleanup: () => unknown, runSuite: () => unknown) => number;
};

describe('TesterArmy runner lifecycle', () => {
  it('runs from a clean CI checkout only when the independent development host matches', () => {
    const root = mkdtempSync(join(tmpdir(), 'tester-army-ci-'));
    try {
      mkdirSync(join(root, 'scripts'), { recursive: true });
      mkdirSync(join(root, 'node_modules/.bin'), { recursive: true });
      mkdirSync(join(root, 'ios/build/Build/Products/Release-iphonesimulator/Vasuli.app'), { recursive: true });
      for (const file of ['tester-army-run.cjs', 'run-e2e-with-cleanup.cjs']) {
        copyFileSync(join(process.cwd(), 'scripts', file), join(root, 'scripts', file));
      }
      writeFileSync(join(root, 'scripts/e2e-cleanup.cjs'), 'process.exit(0);\n');
      writeFileSync(join(root, 'node_modules/.bin/e2e'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
      const env = {
        ...process.env,
        EXPO_PUBLIC_SUPABASE_URL: 'https://approved-project.supabase.co',
        SUPABASE_DEV_HOST: 'approved-project.supabase.co',
      };
      const run = (host: string) => spawnSync(process.execPath, [join(root, 'scripts/tester-army-run.cjs'), '--target', 'ios'], {
        cwd: root,
        env: { ...env, SUPABASE_DEV_HOST: host },
        encoding: 'utf8',
      });
      expect(run('approved-project.supabase.co').status).toBe(0);
      expect(run('').status).toBe(1);
      const mismatch = run('other-project.supabase.co');
      expect(mismatch.status).toBe(1);
      expect(mismatch.stderr).toContain('development Supabase host match');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('cleans before and after a suite even when the runner throws', () => {
    const cleanup = vi.fn(() => ({ status: 0 }));
    const runSuite = vi.fn(() => { throw new Error('suite crashed'); });
    const report = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      expect(runWithCleanup(cleanup, runSuite)).toBe(1);
      expect(cleanup).toHaveBeenCalledTimes(2);
      expect(runSuite).toHaveBeenCalledTimes(1);
    } finally {
      report.mockRestore();
    }
  });

  it('does not start tests when pre-run cleanup fails, and still attempts final cleanup', () => {
    const cleanup = vi.fn()
      .mockReturnValueOnce({ status: 3 })
      .mockReturnValueOnce({ status: 0 });
    const runSuite = vi.fn(() => ({ status: 0 }));

    expect(runWithCleanup(cleanup, runSuite)).toBe(3);
    expect(cleanup).toHaveBeenCalledTimes(2);
    expect(runSuite).not.toHaveBeenCalled();
  });

  it('keeps a suite failure when the post-run cleanup also fails', () => {
    const cleanup = vi.fn()
      .mockReturnValueOnce({ status: 0 })
      .mockReturnValueOnce({ status: 9 });
    const runSuite = vi.fn(() => ({ status: 7 }));

    expect(runWithCleanup(cleanup, runSuite)).toBe(7);
    expect(cleanup).toHaveBeenCalledTimes(2);
  });

  it('lists discovered flows without requiring a device, credentials, or cleanup', () => {
    const runCommand = vi.fn((_command: string, _args: string[]) => ({ status: 0 }));

    expect(runTesterArmy({ args: ['list'], env: {}, runCommand })).toBe(0);
    expect(runCommand).toHaveBeenCalledTimes(1);
    expect(runCommand.mock.calls[0][1]).toEqual(['list']);
  });

  it('rejects a host mismatch before invoking fixture cleanup', () => {
    const runCommand = vi.fn((_command: string, _args: string[]) => ({ status: 0 }));
    const report = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      expect(runTesterArmy({
        args: ['--target', 'ios'],
        env: {
          EXPO_PUBLIC_SUPABASE_URL: 'https://other-project.supabase.co',
          SUPABASE_DEV_HOST: 'approved-project.supabase.co',
        },
        runCommand,
      })).toBe(1);
      expect(runCommand).not.toHaveBeenCalled();
      expect(report).toHaveBeenCalledWith(expect.stringContaining('development Supabase host match.'));
    } finally {
      report.mockRestore();
    }
  });
});
