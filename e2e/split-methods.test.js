const { loginToFriends, openGroups } = require('./helpers/auth');
const { addFirstAvailableFriend, createGroup, openGroupDetails } = require('./helpers/groups');
const { dismissSuccessAlert } = require('./helpers/common');
const {
  fillCustomSplit,
  openGroupExpenseForm,
  selectSplitMethod,
  submitExpense,
} = require('./helpers/splits');

async function setupGroupWithFriend() {
  await loginToFriends();
  await openGroups();
  const groupName = await createGroup();
  await openGroupDetails(groupName);
  const friendName = await addFirstAvailableFriend(groupName);
  if (!friendName) {
    throw new Error(
      'Split method E2E requires at least one accepted friend for the configured development test account.',
    );
  }
  return groupName;
}

describe('Split methods', () => {
  it('splits unequally by exact amounts', async () => {
    const groupName = await setupGroupWithFriend();

    await openGroupExpenseForm(groupName);
    await element(by.id('expense-amount-input')).replaceText('20.00');
    await element(by.id('expense-description-input')).typeText(`Detox Split ${Date.now()}`);
    await selectSplitMethod('Unequal');
    await fillCustomSplit('14.50', '5.50');
    await submitExpense(groupName);

    await waitFor(element(by.text('$20.00')).atIndex(0))
      .toBeVisible()
      .withTimeout(15000);
  });

  it('rejects unequal splits that do not sum to the total', async () => {
    const groupName = await setupGroupWithFriend();

    await openGroupExpenseForm(groupName);
    await element(by.id('expense-amount-input')).replaceText('20.00');
    await element(by.id('expense-description-input')).typeText(`Detox Split ${Date.now()}`);
    await selectSplitMethod('Unequal');
    await fillCustomSplit('15.00', '15.00');
    await element(by.id('add-expense-submit-button')).tap();
    await waitFor(element(by.text('Invalid Split')))
      .toBeVisible()
      .withTimeout(5000);
    await dismissSuccessAlert();
    await fillCustomSplit('15.00', '5.00');
    await submitExpense(groupName);

    await waitFor(element(by.text('$20.00')).atIndex(0))
      .toBeVisible()
      .withTimeout(15000);
  });

  it('splits by percentage', async () => {
    const groupName = await setupGroupWithFriend();

    await openGroupExpenseForm(groupName);
    await element(by.id('expense-amount-input')).replaceText('30.00');
    await element(by.id('expense-description-input')).typeText(`Detox Split ${Date.now()}`);
    await selectSplitMethod('Percentage');
    await fillCustomSplit('60', '40');
    await submitExpense(groupName);

    await waitFor(element(by.text('$30.00')).atIndex(0))
      .toBeVisible()
      .withTimeout(15000);
  });

  it('splits by shares', async () => {
    const groupName = await setupGroupWithFriend();

    await openGroupExpenseForm(groupName);
    await element(by.id('expense-amount-input')).replaceText('10.00');
    await element(by.id('expense-description-input')).typeText(`Detox Split ${Date.now()}`);
    await selectSplitMethod('Shares');
    await fillCustomSplit('3', '1');
    await submitExpense(groupName);

    await waitFor(element(by.text('$10.00')).atIndex(0))
      .toBeVisible()
      .withTimeout(15000);
  });
});
