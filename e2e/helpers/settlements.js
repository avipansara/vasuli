const { dismissSuccessAlert, tapAlertButton } = require('./common');

async function reverseLastSettlementOnFriendDetail() {
  // Only operation-backed settlements render this button; the friend-settle
  // path always creates those, but the activity list can take a moment.
  const reverseButton = element(by.label('Reverse settlement')).atIndex(0);
  await waitFor(reverseButton)
    .toBeVisible()
    .withTimeout(15000);
  await reverseButton.tap();
  await waitFor(element(by.text('Reverse settlement?')))
    .toBeVisible()
    .withTimeout(5000);
  await tapAlertButton('Reverse');
  await waitFor(element(by.text('Settlement reversed')))
    .toBeVisible()
    .withTimeout(15000);
  await dismissSuccessAlert();
}

module.exports = { reverseLastSettlementOnFriendDetail };
