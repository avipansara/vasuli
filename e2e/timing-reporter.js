const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

class E2ETimingReporter {
  constructor() {
    this.startedAt = performance.now();
    this.tests = [];
  }

  onRunStart() {
    this.startedAt = performance.now();
    this.startedAtEpoch = Date.now();
    console.log('[e2e-timing] Jest execution started');
  }

  onTestCaseResult(_test, result) {
    const durationMs = result.duration ?? 0;
    const testName = result.fullName || result.title || '<unnamed test>';
    this.tests.push({
      name: testName,
      durationMs,
      status: result.status,
    });
    console.log(`[e2e-timing] test ${testName}: ${(durationMs / 1000).toFixed(3)}s (${result.status})`);
  }

  onRunComplete() {
    const finishedAt = performance.now();
    const artifact = {
      jest: {
        durationMs: finishedAt - this.startedAt,
        startedAtEpoch: this.startedAtEpoch,
        finishedAtEpoch: Date.now(),
      },
      tests: this.tests,
    };
    const timingFile = process.env.E2E_TIMING_FILE;
    if (!timingFile) return;
    fs.mkdirSync(path.dirname(timingFile), { recursive: true });
    fs.writeFileSync(timingFile, `${JSON.stringify(artifact, null, 2)}\n`);
  }
}

module.exports = E2ETimingReporter;
