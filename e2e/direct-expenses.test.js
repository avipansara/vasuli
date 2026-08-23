const { goBack, loginToFriends, openActivity } = require('./helpers/auth');
const { openFriendDetail } = require('./helpers/groups');
const { purgeFixtureRun, seedFriendship } = require('./helpers/fixtures');
const {
  deleteOpenExpenseFromDetail,
  expectActivityRowOwed,
  expectDeletedEventRow,
  openDirectExpenseDetail,
  recordDirectExpense,
  returnToFriendDetailAfterDeletion,
} = require('./helpers/friends');

afterEach(async () => {
  await purgeFixtureRun({ testKey: 'direct-expense-lifecycle' });
});

describe('Direct expenses', () => {
  it('records a direct expense from the friend FAB and surfaces its deletion on friend and activity feeds', async () => {
    await loginToFriends();
    const fixture = await seedFriendship({ testKey: 'direct-expense-lifecycle' });
    await device.reloadReactNative();
    await openFriendDetail(fixture.friendName);

    const description = await recordDirectExpense(fixture.friendName, '18.00', 'direct-expense-lifecycle');
    await expectActivityRowOwed(description);

    await openDirectExpenseDetail(description);
    await deleteOpenExpenseFromDetail();
    await returnToFriendDetailAfterDeletion();
    await expectDeletedEventRow(description);

    // The deletion also surfaces as a "Deleted" card in the Activity feed.
    // Deleted direct expenses are non-navigable so their card renders
    // without an accessibility label; the badge text is the stable matcher.
    await goBack();
    await waitFor(element(by.id('friends-screen')))
      .toBeVisible()
      .withTimeout(10000);
    await openActivity();
    await element(by.id('activity-search-input')).typeText(description);
    await waitFor(element(by.text('Deleted')).atIndex(0))
      .toBeVisible()
      .withTimeout(15000);
  });
});
