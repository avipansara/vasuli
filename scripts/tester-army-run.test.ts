import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { runTesterArmy } = require('./tester-army-run.cjs') as {
  runTesterArmy: (options: Record<string, unknown>) => number;
};
const { runWithCleanup } = require('./run-e2e-with-cleanup.cjs') as {
  runWithCleanup: (cleanup: () => unknown, runSuite: () => unknown) => number;
};

describe('TesterArmy runner lifecycle', () => {
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
