const { loginToFriends, openGroups } = require('./helpers/auth');
const { openGroupDetails } = require('./helpers/groups');
const { purgeFixtureRun, seedGroupMembership } = require('./helpers/fixtures');
const {
  fillCustomSplit,
  fillExpenseDescription,
  openGroupExpenseForm,
  selectSplitMethod,
  submitExpense,
} = require('./helpers/splits');

afterEach(async () => {
  await purgeFixtureRun({ testKey: 'split-custom' });
});

async function setupGroupWithFriend(testKey) {
  await loginToFriends();
  const fixture = await seedGroupMembership({ testKey });
  await device.reloadReactNative();
  await openGroups();
  await openGroupDetails(fixture.groupName);
  return fixture.groupName;
}

describe('Split methods', () => {
  it('records a custom split by exact amounts', async () => {
    const groupName = await setupGroupWithFriend('split-custom');
    const description = `Detox Split ${Date.now()}`;

    await openGroupExpenseForm(groupName);
    await element(by.id('expense-amount-input')).replaceText('20.00');
    await fillExpenseDescription(description);
    await selectSplitMethod('Unequal');
    await fillCustomSplit('14.50', '5.50');
    await submitExpense(groupName);

    await waitFor(element(by.text(description)))
      .toBeVisible()
      .withTimeout(15000);
  });

});
