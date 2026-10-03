function exitCode(result) {
  if (!result) return 1;
  if (typeof result.status === 'number') return result.status;
  if (result.signal) return 128 + (require('node:os').constants.signals[result.signal] ?? 1);
  return 1;
}

function runWithCleanup(cleanup, runSuite) {
  let beforeStatus = 1;
  let suiteStatus = 1;
  let afterStatus = 1;
  let failed = false;
  try {
    beforeStatus = exitCode(cleanup());
    if (beforeStatus === 0) suiteStatus = exitCode(runSuite());
  } catch (error) {
    failed = true;
    console.error('[tester-army] Test setup or runner failed:', error.message ?? error);
  } finally {
    try {
      afterStatus = exitCode(cleanup());
    } catch (error) {
      failed = true;
      console.error('[tester-army] Post-run cleanup failed:', error.message ?? error);
    }
  }
  return failed ? 1 : beforeStatus || suiteStatus || afterStatus;
}

module.exports = { runWithCleanup };
