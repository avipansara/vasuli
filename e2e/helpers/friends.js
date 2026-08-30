const { goBack } = require('./auth');
const { tapAlertButton } = require('./common');
const { fillExpenseDescription } = require('./splits');

const SCREEN_WAIT_MS = 10000;
const BALANCE_WAIT_MS = 15000;

async function waitForFriendDetail() {
  await waitFor(element(by.label('Activity filter')))
    .toBeVisible()
    .withTimeout(SCREEN_WAIT_MS);
}

async function recordDirectExpense(friendName, amount = '18.00', testKey = 'direct-expense') {
  if (!friendName) {
    throw new Error('recordDirectExpense requires the name returned by the accepted-friend fixture.');
  }
  const description = `Detox Direct ${process.env.E2E_RUN_ID ?? Date.now()} ${process.env.E2E_WORKER_ID ?? 'worker-0'} ${testKey}`;

  await element(by.label('Add expense')).tap();
  // A preselected friend opens the form straight on step 2: no step
  // indicator and no people/group selection step.
  await waitFor(element(by.id('expense-amount-input')))
    .toBeVisible()
    .withTimeout(SCREEN_WAIT_MS);
  await expect(element(by.label(/^Step \d of 2$/))).toBeNotVisible();
  await element(by.id('expense-amount-input')).replaceText(amount);
  await fillExpenseDescription(description);
  await element(by.id('add-expense-submit-button')).tap();
  await waitForFriendDetail();

  return description;
}

// The shared development friendship carries history from earlier runs, so
// absolute balance titles are not deterministic. Assert on the new activity
// row's label instead ("..., you are owed $X" / "..., you owe $X").
async function expectActivityRowOwed(description) {
  await waitFor(element(by.label(new RegExp(`^${description}, .*you are owed .*$`))))
    .toBeVisible()
    .withTimeout(BALANCE_WAIT_MS);
}

// Deleting soft-deletes the expense and the server logs a "Deleted" event;
// the friend page renders it as an activity row whose label starts with
// "Deleted <description>" (statusLabel + stripped title).
async function expectDeletedEventRow(description) {
  await waitFor(element(by.label(new RegExp(`^Deleted ${description}, .*$`))))
    .toBeVisible()
    .withTimeout(BALANCE_WAIT_MS);
}

async function expectActivityRowGone(description) {
  await waitFor(element(by.label(new RegExp(`^${description}, .*you are owed .*$`))))
    .toBeNotVisible()
    .withTimeout(BALANCE_WAIT_MS);
}

async function openDirectExpenseDetail(description) {
  // Activity rows expose their label starting with the expense description.
  const row = element(by.label(new RegExp(`^${description}, .*$`)));
  await waitFor(row).toBeVisible().withTimeout(SCREEN_WAIT_MS);
  await row.tap();
  await waitFor(element(by.id('expense-detail-delete-button')))
    .toBeVisible()
    .withTimeout(SCREEN_WAIT_MS);
}

// Deletes the expense currently open on the expense-detail screen. Unlike
// the group-flow variant, no postcondition is asserted here: the friend page
// keeps showing the description inside its "Deleted" event row.
async function deleteOpenExpenseFromDetail() {
  await element(by.id('expense-detail-delete-button')).tap();
  await waitFor(element(by.text('Delete Expense')))
    .toBeVisible()
    .withTimeout(5000);
  await tapAlertButton('Delete');
}

// Deleting from expense detail pops back to friend detail automatically;
// only tap Go back when that auto-pop has not landed yet.
async function returnToFriendDetailAfterDeletion() {
  try {
    await waitFor(element(by.label('Activity filter')))
      .toBeVisible()
      .withTimeout(3000);
  } catch {
    await goBack();
    await waitForFriendDetail();
  }
}

module.exports = {
  deleteOpenExpenseFromDetail,
  expectActivityRowGone,
  expectActivityRowOwed,
  expectDeletedEventRow,
  openDirectExpenseDetail,
  recordDirectExpense,
  returnToFriendDetailAfterDeletion,
};
