const { goBack, loginToFriends, openFriends, openGroups } = require('./helpers/auth');
const { purgeFixtureRun, seedSettlementReversal } = require('./helpers/fixtures');
const { openFriendDetail } = require('./helpers/groups');
const { tapAlertButton } = require('./helpers/common');
const { deleteFriendSettlementOperation } = require('./helpers/settlements');

afterEach(async () => {
  await purgeFixtureRun({ testKey: 'settlement-reversal' });
});

describe('Settlement deletion', () => {
  // This remains a separate case so the fixture can prepare a completed
  // operation and the assertions can cover both Friend and Group Activity.
  //
  // Whole-operation Delete is selected through stable operation-scoped
  // testIDs. Visible copy is asserted with by.text, never used to select an
  // accessibility announcement.
  it('deletes a settled operation and restores the friend and group surfaces', async () => {
    await loginToFriends();
    const fixture = await seedSettlementReversal({ testKey: 'settlement-reversal' });
    const { operationId } = fixture;
    await device.reloadReactNative();
    await openFriends();
    await openFriendDetail(fixture.friendName);
    await element(by.label('Updates')).tap();

    // The intended operation renders once and is selected by testID.
    await waitFor(element(by.id(`friend-settlement-operation-${operationId}`)))
      .toBeVisible()
      .withTimeout(15000);
    await waitFor(element(by.text('Balance details')))
      .toBeVisible()
      .withTimeout(5000);
    await element(by.id(`friend-balance-details-toggle-${operationId}`)).tap();
    await waitFor(element(by.text('Balance adjustment')))
      .toBeVisible()
      .withTimeout(5000);
    await waitFor(element(by.text('No additional payment')))
      .toBeVisible()
      .withTimeout(5000);

    // Legacy per-record wording and actions must not render.
    await waitFor(element(by.label('Reverse settlement')))
      .toBeNotVisible()
      .withTimeout(5000);
    await waitFor(element(by.text('Reversed balance offset')))
      .toBeNotVisible()
      .withTimeout(5000);

    const outcome = await deleteFriendSettlementOperation(operationId);

    if (outcome === 'stale') {
      // A stale confirmation keeps the entry unchanged and retryable after
      // refresh.
      await tapAlertButton('Cancel');
      await waitFor(element(by.id(`friend-settlement-operation-${operationId}`)))
        .toBeVisible()
        .withTimeout(10000);
      await waitFor(element(by.id(`delete-settlement-operation-${operationId}`)))
        .toBeVisible()
        .withTimeout(5000);
    } else {
      // Deleted history stays in place, marked Deleted, with Delete hidden on
      // every representation of the operation.
      await waitFor(element(by.text('Deleted')))
        .toBeVisible()
        .withTimeout(15000);
      await waitFor(element(by.id(`delete-settlement-operation-${operationId}`)))
        .toBeNotVisible()
        .withTimeout(5000);

      const firstName = fixture.friendName.split(' ')[0].toUpperCase();
      await waitFor(element(by.text(`${firstName} OWES YOU`)))
        .toBeVisible()
        .withTimeout(15000);
    }

    await goBack();
    await openGroups();
    await waitFor(element(by.text(fixture.groupName))).toBeVisible().withTimeout(10000);
    await element(by.text(fixture.groupName)).atIndex(0).tap();

    // Group Activity carries the same operation with group-local details.
    await waitFor(element(by.id(`group-settlement-operation-${operationId}`)))
      .toBeVisible()
      .withTimeout(15000);
    await waitFor(element(by.text('Reversed balance offset')))
      .toBeNotVisible()
      .withTimeout(5000);
    if (outcome !== 'stale') {
      await waitFor(element(by.text('Deleted')))
        .toBeVisible()
        .withTimeout(15000);
    }
  });
});
