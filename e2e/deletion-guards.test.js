const { loginToFriends, openGroups } = require('./helpers/auth');
const { addFirstAvailableFriend, createGroup, openGroupDetails, recordExpense } = require('./helpers/groups');
const { dismissSuccessAlert } = require('./helpers/common');

async function setupGroupWithOutstandingBalance() {
  await loginToFriends();
  await openGroups();
  const groupName = await createGroup();
  await openGroupDetails(groupName);
  const friendName = await addFirstAvailableFriend(groupName);
  if (!friendName) {
    throw new Error('Deletion-guard E2E requires capturing the added friend display name.');
  }
  await recordExpense(groupName);
  return { groupName, friendName };
}

describe('Deletion guards', () => {
  it('blocks group deletion while a balance is outstanding', async () => {
    const { groupName } = await setupGroupWithOutstandingBalance();

    await element(by.id('delete-group-button')).tap();
    await waitFor(element(by.text('Settle Group First')))
      .toBeVisible()
      .withTimeout(5000);

    try {
      await waitFor(element(by.text('Delete Group')))
        .toBeNotVisible()
        .withTimeout(3000);
    } catch {
      throw new Error('Delete Group confirmation appeared even though the group has an outstanding balance.');
    }

    await dismissSuccessAlert();
    await expect(element(by.text(groupName))).toBeVisible();
  });

  it('blocks member removal while a balance is outstanding', async () => {
    const { friendName } = await setupGroupWithOutstandingBalance();

    await element(by.text(friendName)).atIndex(0).swipe('left', 'slow', 0.55);
    await waitFor(element(by.label('Remove')).atIndex(0))
      .toBeVisible()
      .withTimeout(5000);
    await element(by.label('Remove')).atIndex(0).tap();
    await waitFor(element(by.text('Settle Balance First')))
      .toBeVisible()
      .withTimeout(5000);

    try {
      await waitFor(element(by.text('Remove Member')))
        .toBeNotVisible()
        .withTimeout(3000);
    } catch {
      throw new Error('Remove Member confirmation appeared even though the member has an outstanding balance.');
    }

    await dismissSuccessAlert();
    await expect(element(by.text(friendName)).atIndex(0)).toBeVisible();
  });
});
