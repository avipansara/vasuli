const { loginToFriends, openGroups } = require('./helpers/auth');
const { addFirstAvailableFriend, createGroup, openGroupDetails, recordExpense } = require('./helpers/groups');

describe('Settlements', () => {
  it('adds a friend, records an expense, and settles the group balance', async () => {
    await loginToFriends();
    await openGroups();
    const groupName = await createGroup();
    await openGroupDetails(groupName);
    await addFirstAvailableFriend(groupName);
    await recordExpense(groupName);
    await waitFor(element(by.id('group-settle-up-button')))
      .toBeVisible()
      .withTimeout(10000);

    await element(by.id('group-settle-up-button')).tap();
    await waitFor(element(by.id('group-settle-amount-input')))
      .toBeVisible()
      .withTimeout(10000);
    await element(by.id('group-record-settlement-button')).tap();
    await expect(element(by.text('Success'))).toBeVisible();
  });
});
