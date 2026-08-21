const { goBack, loginToFriends, openFriends, openGroups } = require('./helpers/auth');
const {
  addFirstAvailableFriend,
  createGroup,
  openFriendDetail,
  openGroupDetails,
  recordExpense,
  settleWithFriend,
} = require('./helpers/groups');

describe('Friend settlements', () => {
  it('settles a combined balance from the friend detail screen', async () => {
    await loginToFriends();
    await openGroups();
    const groupName = await createGroup();
    await openGroupDetails(groupName);
    const friendName = await addFirstAvailableFriend(groupName);
    await recordExpense(groupName);

    await goBack();
    await waitFor(element(by.label('Create group')))
      .toBeVisible()
      .withTimeout(10000);
    await openFriends();

    await openFriendDetail(friendName);
    await settleWithFriend(friendName);
  });
});
