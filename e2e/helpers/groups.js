const { tapAlertButton } = require('./common');

function groupCardFor(groupName) {
  return element(by.text(groupName)).atIndex(0);
}

async function createGroup(
  groupName = `Detox Group ${process.env.E2E_RUN_ID ? `${process.env.E2E_RUN_ID} ` : ''}${Date.now()}`,
) {
  await element(by.label('Create group')).tap();
  await element(by.id('create-group-name-input')).typeText(groupName);
  await element(by.id('create-group-submit-button')).tap();
  await waitFor(element(by.label(`${groupName}, all settled up`)))
    .toBeVisible()
    .withTimeout(10000);
  return groupName;
}

async function openGroupDetails(groupName) {
  const groupCard = groupCardFor(groupName);
  await waitFor(groupCard).toBeVisible().withTimeout(10000);
  await groupCard.tap();

  try {
    await waitFor(element(by.text(groupName))).toBeVisible().withTimeout(10000);
  } catch {
    await waitFor(element(by.text('Try again'))).toBeVisible().withTimeout(3000);
    await element(by.text('Try again')).tap();
    await waitFor(element(by.text(groupName))).toBeVisible().withTimeout(10000);
  }
}

async function recordExpense(groupName) {
  const expenseDescription = `Detox Expense ${Date.now()}`;

  await element(by.label('Add expense')).tap();
  await element(by.label(`Select group ${groupName}`)).tap();
  await element(by.id('add-expense-next-button')).tap();
  await element(by.id('expense-amount-input')).replaceText('12.00');
  // The amount field autofocuses and the keyboard can clip the description
  // field. Scroll the named form before tapping so this remains deterministic
  // on the release simulator rather than waiting for a visibility timeout.
  await element(by.id('expense-form-scroll')).scroll(300, 'down');
  await element(by.id('expense-description-input')).tap();
  await element(by.id('expense-description-input')).typeText(expenseDescription);
  await element(by.id('add-expense-submit-button')).tap();
  await waitFor(groupCardFor(groupName))
    .toBeVisible()
    .withTimeout(10000);

  return expenseDescription;
}

async function openFriendDetail(friendName) {
  if (!friendName) {
    throw new Error('openFriendDetail requires the friend name returned by the fixture.');
  }
  const friendCard = element(by.text(friendName)).atIndex(0);
  try {
    await waitFor(friendCard).toBeVisible().withTimeout(3000);
  } catch {
    // With a clean baseline the friend has a zero balance and lives in the
    // collapsed "Settled Up (N)" accordion at the bottom of the Friends tab.
    const accordion = element(by.text(/^Settled Up \(\d+\)$/));
    await waitFor(accordion).toBeVisible().withTimeout(5000);
    await accordion.tap();
    await waitFor(friendCard).toBeVisible().withTimeout(5000);
  }
  await friendCard.tap();
  await waitFor(element(by.label('Activity filter')))
    .toBeVisible()
    .withTimeout(10000);
}

async function settleWithFriend(friendName) {
  await waitFor(element(by.id('friend-settle-up-button')))
    .toBeVisible()
    .withTimeout(10000);
  await element(by.id('friend-settle-up-button')).tap();
  await waitFor(element(by.id('friend-settle-amount-input')))
    .toBeVisible()
    .withTimeout(10000);
  await element(by.id('friend-record-settlement-button')).tap();
  await waitFor(element(by.text('Confirm Settle Up')))
    .toBeVisible()
    .withTimeout(5000);
  await tapAlertButton('Confirm');
  await waitFor(element(by.text('Success')))
    .toBeVisible()
    .withTimeout(15000);
}

async function openExpenseDetail(description) {
  const row = element(by.label(`View details for ${description}`));
  await waitFor(row).toBeVisible().withTimeout(10000);
  await row.tap();
  await waitFor(element(by.id('expense-detail-edit-button')))
    .toBeVisible()
    .withTimeout(10000);
}

async function editExpenseAmount(amount) {
  await element(by.id('expense-detail-edit-button')).tap();
  await waitFor(element(by.id('edit-expense-amount-input')))
    .toBeVisible()
    .withTimeout(10000);
  await element(by.id('edit-expense-amount-input')).replaceText(amount);
  await element(by.id('edit-expense-save-button')).tap();
}

async function deleteExpenseFromDetail(description) {
  await element(by.id('expense-detail-delete-button')).tap();
  await waitFor(element(by.text('Delete Expense')))
    .toBeVisible()
    .withTimeout(5000);
  await tapAlertButton('Delete');
  await waitFor(element(by.text(description)))
    .toBeNotVisible()
    .withTimeout(30000);
}

async function renameGroupFromList(oldName, newName) {
  const card = element(by.label(`${oldName}, all settled up`));
  await waitFor(card).toBeVisible().withTimeout(10000);
  await card.swipe('right', 'slow', 0.55);
  await waitFor(element(by.label(`Edit ${oldName}`)))
    .toBeVisible()
    .withTimeout(5000);
  await element(by.label(`Edit ${oldName}`)).tap();
  await waitFor(element(by.id('edit-group-name-input')))
    .toBeVisible()
    .withTimeout(10000);
  await element(by.id('edit-group-name-input')).replaceText(newName);
  await element(by.id('edit-group-save-button')).tap();
  await waitFor(element(by.text(newName)))
    .toBeVisible()
    .withTimeout(10000);
}

async function deleteGroupFromDetails(groupName) {
  await openGroupDetails(groupName);
  await element(by.id('delete-group-button')).tap();
  await waitFor(element(by.text('Delete Group')))
    .toBeVisible()
    .withTimeout(5000);
  await tapAlertButton('Delete');
  // Deletion is a soft delete: the group moves to the list's
  // "Recently deleted" section with a Restore action.
  await waitFor(element(by.label(`Restore ${groupName}`)))
    .toBeVisible()
    .withTimeout(15000);
}

module.exports = {
  createGroup,
  deleteExpenseFromDetail,
  deleteGroupFromDetails,
  editExpenseAmount,
  openExpenseDetail,
  openFriendDetail,
  openGroupDetails,
  recordExpense,
  renameGroupFromList,
  settleWithFriend,
};
