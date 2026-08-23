const { goBack, loginToFriends, openActivity, openFriends, openGroups } = require('./helpers/auth');
const {
  addFirstAvailableFriend,
  createGroup,
  openFriendDetail,
  openGroupDetails,
} = require('./helpers/groups');
const {
  deleteOpenExpenseFromDetail,
  expectActivityRowOwed,
  expectDeletedEventRow,
  openDirectExpenseDetail,
  recordDirectExpense,
  returnToFriendDetailAfterDeletion,
} = require('./helpers/friends');

describe('Direct expenses', () => {
  it('records a direct expense from the friend FAB and surfaces its deletion on friend and activity feeds', async () => {
    await loginToFriends();
    await openGroups();
    const groupName = await createGroup();
    await openGroupDetails(groupName);
    const friendName = await addFirstAvailableFriend(groupName);
    if (!friendName) {
      throw new Error(
        'Direct expense E2E requires at least one accepted friend for the configured development test account.',
      );
    }
    await goBack();
    await waitFor(element(by.label('Create group')))
      .toBeVisible()
      .withTimeout(10000);

    await openFriends();
    await openFriendDetail(friendName);

    const description = await recordDirectExpense(friendName);
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
