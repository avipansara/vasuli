const { openGroups } = require('./auth');

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
  await element(by.label(/^Select .+/)).atIndex(0).tap();
  await element(by.text('Add Members')).atIndex(1).tap();
  await waitFor(element(by.label(`Add member to ${groupName}`)))
    .toBeVisible()
    .withTimeout(10000);
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

module.exports = { addFirstAvailableFriend, createGroup, createGroupWithExpense, openGroupDetails, recordExpense };
