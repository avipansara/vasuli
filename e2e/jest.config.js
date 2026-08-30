/** @type {import('@jest/types').Config.InitialOptions} */
module.exports = {
  rootDir: '..',
  testMatch: ['<rootDir>/e2e/**/*.test.js'],
  // Smoke is a focused development check. The default serial suite keeps the
  // same journey out so it does not run twice in release verification.
  testPathIgnorePatterns: process.env.E2E_INCLUDE_SMOKE === '1'
    ? []
    : ['<rootDir>/e2e/smoke.test.js'],
  testTimeout: 120000,
  maxWorkers: 1,
  globalSetup: 'detox/runners/jest/globalSetup',
  globalTeardown: 'detox/runners/jest/globalTeardown',
  reporters: ['detox/runners/jest/reporter', '<rootDir>/e2e/timing-reporter.js'],
  testEnvironment: 'detox/runners/jest/testEnvironment',
  verbose: true,
};
