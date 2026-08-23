const { goBack, loginToFriends, openFriends, openGroups } = require('./helpers/auth');
const { purgeFixtureRun, seedSettlementReversal } = require('./helpers/fixtures');
const { openFriendDetail } = require('./helpers/groups');
const { reverseLastSettlementOnFriendDetail } = require('./helpers/settlements');

afterEach(async () => {
  await purgeFixtureRun({ testKey: 'settlement-reversal' });
});

describe('Settlement reversal', () => {
  // This remains a separate case so the fixture can prepare a completed
  // operation and the assertions can cover both Friend and Group Activity.
  it('reverses a settled balance and restores the friend and group surfaces', async () => {
    await loginToFriends();
    const fixture = await seedSettlementReversal({ testKey: 'settlement-reversal' });
    await device.reloadReactNative();
    await openFriends();
    await openFriendDetail(fixture.friendName);
    await element(by.label('Updates')).tap();
    await reverseLastSettlementOnFriendDetail();

    const firstName = fixture.friendName.split(' ')[0].toUpperCase();
    await waitFor(element(by.text(`${firstName} OWES YOU`)))
      .toBeVisible()
      .withTimeout(15000);

    await goBack();
    await openGroups();
    await waitFor(element(by.text(fixture.groupName))).toBeVisible().withTimeout(10000);
    await element(by.text(fixture.groupName)).atIndex(0).tap();
    await waitFor(element(by.text('Reversed balance offset')))
      .toBeVisible()
      .withTimeout(15000);
  });
});
