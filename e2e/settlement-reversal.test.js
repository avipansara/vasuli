const { goBack, loginToFriends, openFriends, openGroups } = require('./helpers/auth');
const { dismissSuccessAlert } = require('./helpers/common');
const {
  addFirstAvailableFriend,
  createGroup,
  openFriendDetail,
  openGroupDetails,
  recordExpense,
  settleWithFriend,
} = require('./helpers/groups');
const { reverseLastSettlementOnFriendDetail } = require('./helpers/settlements');

describe('Settlement reversal', () => {
  it('reverses a settled balance and restores the friend and group surfaces', async () => {
    await loginToFriends();
    await openGroups();
    const groupName = await createGroup();
    await openGroupDetails(groupName);
    const friendName = await addFirstAvailableFriend(groupName);
    if (!friendName) {
      throw new Error(
        'Settlement reversal E2E requires a resolvable friend display name for the configured development test account.',
      );
    }
    await recordExpense(groupName);

    await goBack();
    await waitFor(element(by.label('Create group')))
      .toBeVisible()
      .withTimeout(10000);
    await openFriends();

    await openFriendDetail(friendName);
    await settleWithFriend(friendName);
    await dismissSuccessAlert();

    await reverseLastSettlementOnFriendDetail();

    const firstName = friendName.split(' ')[0].toUpperCase();
    await waitFor(element(by.text(`${firstName} OWES YOU`)))
      .toBeVisible()
      .withTimeout(15000);

    await goBack();
    await openGroups();
    await openGroupDetails(groupName);
    await waitFor(element(by.text('Reversed balance offset')))
      .toBeVisible()
      .withTimeout(15000);
  });
});
