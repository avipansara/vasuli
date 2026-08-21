const { openGroups } = require('./auth');
const { tapAlertButton } = require('./common');

function groupCardFor(groupName) {
  return element(by.text(groupName)).atIndex(0);
}

async function createGroup(groupName = `Detox Group ${Date.now()}`) {
  await element(by.label('Create group')).tap();
  await element(by.id('create-group-name-input')).typeText(groupName);
  await element(by.id('create-group-submit-button')).tap();
  await waitFor(element(by.label(`${groupName}, all settled up`)))
    .toBeVisible()
    .withTimeout(10000);
  return groupName;
}

async function addFirstAvailableFriend(groupName) {
  await element(by.label(`Add member to ${groupName}`)).tap();
  try {
    await waitFor(element(by.text('No available users. Add friends first.')))
      .toBeVisible()
      .withTimeout(2000);
    throw new Error(
      'Settlement E2E requires at least one accepted friend for the configured development test account.',
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Settlement E2E requires')) throw error;
  }
  const selectRow = element(by.label(/^Select .+/)).atIndex(0);
  let friendName = null;
  try {
    const attributes = await selectRow.getAttributes();
    const label = attributes.label || attributes.text;
    if (label) {
      friendName = label.replace(/^Select\s+/, '');
    }
  } catch {
    // Name capture is best-effort; flows that need it fail later with a clear error.
  }
  await selectRow.tap();
  await element(by.text('Add Members')).atIndex(1).tap();
  await waitFor(element(by.label(`Add member to ${groupName}`)))
    .toBeVisible()
    .withTimeout(10000);
  return friendName;
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
  await element(by.id('expense-description-input')).typeText(expenseDescription);
  await element(by.id('add-expense-submit-button')).tap();
  await waitFor(groupCardFor(groupName))
    .toBeVisible()
    .withTimeout(10000);

  return expenseDescription;
}

async function createGroupWithExpense() {
  await openGroups();
  const groupName = await createGroup();
  const expenseDescription = await recordExpense(groupName);
  return { groupName, expenseDescription };
}

async function openFriendDetail(friendName) {
  if (!friendName) {
    throw new Error('openFriendDetail requires the name captured by addFirstAvailableFriend.');
  }
  const friendCard = element(by.text(friendName)).atIndex(0);
  await waitFor(friendCard).toBeVisible().withTimeout(10000);
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
  addFirstAvailableFriend,
  createGroup,
  createGroupWithExpense,
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
