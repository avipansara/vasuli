const { loginToFriends, openGroups } = require('./helpers/auth');
const { openGroupDetails } = require('./helpers/groups');
const { dismissSuccessAlert } = require('./helpers/common');
const { purgeFixtureRun, seedOutstandingGroup } = require('./helpers/fixtures');

afterEach(async () => {
  await purgeFixtureRun({ testKey: 'deletion-guards' });
});

async function setupGroupWithOutstandingBalance(testKey) {
  await loginToFriends();
  const fixture = await seedOutstandingGroup({ testKey });
  await device.reloadReactNative();
  await openGroups();
  return fixture;
}

describe('Deletion guards', () => {
  it('blocks group deletion and member removal while balances are outstanding', async () => {
    const fixture = await setupGroupWithOutstandingBalance('deletion-guards');
    const { groupName, friendName } = fixture;

    await openGroupDetails(groupName);
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

    await openGroups();
    await openGroupDetails(groupName);
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
