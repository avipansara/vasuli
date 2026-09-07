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
  // Keep this journey separate from deletion. It measures the payment flow
  // from an outstanding balance, while deletion starts from a completed
  // operation and has a different cross-screen postcondition.
  //
  // Ticket 05: asserts the one-activity presentation. The fresh fixture holds
  // no settlement before Settle Up and exactly one after, so the intended
  // operation needs no disambiguation here; where the operation ID is known
  // (deletion specs) selection uses stable operation-scoped testIDs via by.id,
  // never a11y copy.
  it('settles a combined balance from the friend detail screen', async () => {
    await loginToFriends();
    const fixture = await seedOutstandingGroup({ testKey: 'friend-settlement' });
    await device.reloadReactNative();
    await openFriends();
    await openFriendDetail(fixture.friendName);
    await element(by.label('Updates')).tap();
    await settleWithFriend(fixture.friendName);
    await dismissSuccessAlert();

    // Friend surface: the settled operation renders once with the new
    // presentation. Legacy per-record wording must not appear.
    await waitFor(element(by.text('Moved from friendship balance')))
      .toBeNotVisible()
      .withTimeout(5000);
    await waitFor(element(by.text('Moved to friendship balance')))
      .toBeNotVisible()
      .withTimeout(5000);
    await waitFor(element(by.text('Reversed balance offset')))
      .toBeNotVisible()
      .withTimeout(5000);

    await openGroups();
    await openGroupDetails(fixture.groupName);

    // Group surface: the operation merges into one Activity entry with
    // group-local Balance details instead of a separate Balance changes
    // section or per-record transfer wording.
    await waitFor(element(by.text('Balance details')))
      .toBeVisible()
      .withTimeout(15000);
    await element(by.text('Balance details')).atIndex(0).tap();
    await waitFor(element(by.text('Balance adjustment')))
      .toBeVisible()
      .withTimeout(5000);
    await waitFor(element(by.text('No additional payment')))
      .toBeVisible()
      .withTimeout(5000);
    await waitFor(element(by.text('Moved from friendship balance')))
      .toBeNotVisible()
      .withTimeout(5000);
  });
});
