import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd());
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), 'utf8');

const fullSuiteFiles = [
  'e2e/auth.test.js',
  'e2e/activity-balances.test.js',
  'e2e/deletion-guards.test.js',
  'e2e/direct-expenses.test.js',
  'e2e/expense-lifecycle.test.js',
  'e2e/friend-settle.test.js',
  'e2e/group-management.test.js',
  'e2e/payer-selection.test.js',
  'e2e/settlement-reversal.test.js',
  'e2e/split-methods.test.js',
];

describe('serial Detox suite contract', () => {
  it('keeps eleven focused journeys and excludes redundant files', () => {
    const journeyCount = fullSuiteFiles
      .map((file) => read(file).match(/\bit\s*\(/g)?.length ?? 0)
      .reduce((total, count) => total + count, 0);

    expect(journeyCount).toBe(11);
    expect(existsSync(resolve(root, 'e2e/groups.test.js'))).toBe(false);
    expect(existsSync(resolve(root, 'e2e/expenses.test.js'))).toBe(false);
    expect(existsSync(resolve(root, 'e2e/settlements.test.js'))).toBe(false);

    const uiGroupCreationCount = fullSuiteFiles
      .map((file) => read(file).match(/\bcreateGroup\s*\(/g)?.length ?? 0)
      .reduce((total, count) => total + count, 0);
    expect(uiGroupCreationCount).toBe(2);
  });

  it('keeps smoke separate and removes the known-absent friend probe', () => {
    expect(read('e2e/jest.config.js')).toContain('E2E_INCLUDE_SMOKE');
    expect(read('package.json')).toContain('E2E_INCLUDE_SMOKE=1');
    expect(read('package.json')).not.toContain('E2E_MEASUREMENT_SCOPE=');
    expect(read('e2e/smoke.test.js')).toContain('}, 600000);');
    expect(read('e2e/helpers/auth.js')).not.toContain("by.label('Create group')");
    expect(read('e2e/helpers/groups.js')).not.toContain("by.label('Create group')");
    expect(read('e2e/helpers/groups.js')).not.toContain('No available users');
    const coverageMap = read('docs/e2e-coverage-map.md');
    expect(coverageMap).toContain('`split-methods.test.js` invalid unequal split');
    expect(coverageMap).toContain('utils/split-validation.test.ts');
    expect(coverageMap).toContain('one run-scoped seeded Group');
    expect(read('utils/split-validation.test.ts')).toContain('rejects unequal splits that do not add up');
  });

  it('keeps GitHub E2E workflows clean-checkout safe and out of general CI', () => {
    const smokeWorkflow = read('.github/workflows/e2e-smoke.yml');
    const fullWorkflow = read('.github/workflows/e2e-full.yml');

    for (const [workflow, suiteCommand] of [[smokeWorkflow, 'npm run e2e:ios:smoke'], [fullWorkflow, 'npm run e2e:ios']] as const) {
      expect(workflow).toContain('runs-on: macos-26');
      expect(workflow).toContain('npm ci');
      expect(workflow).toContain('npx expo prebuild --platform ios --no-install');
      expect(workflow).toContain('pod install --project-directory=ios');
      expect(workflow).toContain('actions/cache@v4');
      expect(workflow).toContain('ios/Pods');
      expect(workflow).toContain('ios/Podfile.lock');
      expect(workflow).not.toContain('restore-keys:');
      expect(workflow).toContain('npm run e2e:build:ios');
      expect(workflow).toContain('node scripts/e2e-prepare-ios-simulator.cjs');
      expect(workflow).toContain(suiteCommand);
      expect(workflow).toContain('Collect ');
      expect(workflow).toContain('ci-artifacts/timing');
      expect(workflow).toContain("find \"$timing_dir\" -type f -name '*.json'");
      const uploadPath = workflow.slice(workflow.lastIndexOf('path: |'));
      expect(uploadPath).not.toContain('.scratch/detox-e2e-performance/measurements/ci-');
      expect(workflow).toContain('actions/upload-artifact@v4');
      expect(workflow).toContain('if: always()');
      expect(workflow).toContain('retention-days:');

      expect(workflow.indexOf('npm ci')).toBeLessThan(workflow.indexOf('npx expo prebuild'));
      expect(workflow.indexOf('npx expo prebuild')).toBeLessThan(workflow.indexOf('pod install'));
      expect(workflow.indexOf('npm run e2e:build:ios')).toBeLessThan(workflow.indexOf(suiteCommand));
      expect(workflow.indexOf('node scripts/e2e-prepare-ios-simulator.cjs')).toBeLessThan(workflow.indexOf(suiteCommand));
    }

    expect(smokeWorkflow).toContain('timeout-minutes: 40');
    expect(smokeWorkflow).toContain('pull_request:');
    expect(smokeWorkflow).toContain('paths:');
    expect(fullWorkflow).toContain('schedule:');
    expect(fullWorkflow).toContain('workflow_dispatch:');
    expect(read('.github/workflows/ci-validation.yml')).not.toContain('e2e:ios');
    expect(read('.github/workflows/staging-build.yml')).not.toContain('e2e:ios');
    expect(read('.github/workflows/production-build.yml')).not.toContain('e2e:ios');
  });
});
