const { loginToFriends, openFriends, openGroups } = require('./helpers/auth');
const {
  openGroupDetails,
  openFriendDetail,
  settleWithFriend,
} = require('./helpers/groups');
const { dismissSuccessAlert } = require('./helpers/common');
const { purgeFixtureRun, seedOutstandingGroup } = require('./helpers/fixtures');

afterEach(async () => {
  await purgeFixtureRun({ testKey: 'friend-settlement' });
});

describe('Friend settlements', () => {
  // Keep this journey separate from reversal. It measures the payment flow
  // from an outstanding balance, while reversal starts from a completed
  // operation and has a different cross-screen postcondition.
  it('settles a combined balance from the friend detail screen', async () => {
    await loginToFriends();
    const fixture = await seedOutstandingGroup({ testKey: 'friend-settlement' });
    await device.reloadReactNative();
    await openFriends();
    await openFriendDetail(fixture.friendName);
    await element(by.label('Updates')).tap();
    await settleWithFriend(fixture.friendName);
    await dismissSuccessAlert();
    await openGroups();
    await openGroupDetails(fixture.groupName);

    // The Group surface exposes the transfer as separate visible text nodes.
    // Scope the assertion to this run's unique group and exact settlement.
    await waitFor(element(by.text('Moved from friendship balance')))
      .toBeVisible()
      .withTimeout(15000);
    await waitFor(element(by.text('USD 12.00'))).toBeVisible().withTimeout(15000);
  });
});
