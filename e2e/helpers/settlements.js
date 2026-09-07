const { dismissSuccessAlert, tapAlertButton } = require('./common');

// Whole-operation Delete helpers. Selection always uses stable operation-scoped
// testIDs via by.id —
// never exact accessibility copy. Visible copy below is only asserted with
// by.text, never used as a selector for an a11y announcement.
//
// Helpers surface a stale confirmation outcome instead of hiding it; callers
// assert the matching presentation (Deleted history vs preserved entry with
// retry).

async function expandFriendDetailsIfNeeded(operationId) {
  const toggle = element(by.id(`friend-balance-details-toggle-${operationId}`));
  try {
    await waitFor(toggle).toBeVisible().withTimeout(3000);
    await toggle.tap();
  } catch {
    // Payment-only operations have no expandable section (Delete is swipe-only).
  }
}

async function expandGroupDetailsIfNeeded(operationId) {
  const toggle = element(by.id(`group-balance-details-toggle-${operationId}`));
  try {
    await waitFor(toggle).toBeVisible().withTimeout(3000);
    await toggle.tap();
  } catch {
    // Payment-only operations have no expandable section (Delete is swipe-only).
  }
}

async function confirmDeleteAlert() {
  try {
    await waitFor(element(by.text('Delete settlement?')))
      .toBeVisible()
      .withTimeout(5000);
  } catch {
    await waitFor(element(by.text('Delete balance clearing?')))
      .toBeVisible()
      .withTimeout(5000);
  }
  await tapAlertButton('Delete');
}

// Resolves to 'deleted' on Settlement deleted / Balance clearing deleted,
// 'already_deleted' on Already deleted, or 'stale' when the balance changed
// after confirmation.
async function awaitDeleteOutcome() {
  try {
    await waitFor(element(by.text('Settlement deleted')))
      .toBeVisible()
      .withTimeout(15000);
    await dismissSuccessAlert();
    return 'deleted';
  } catch {
    // Fall through to the other known receipts.
  }
  try {
    await waitFor(element(by.text('Balance clearing deleted')))
      .toBeVisible()
      .withTimeout(3000);
    await dismissSuccessAlert();
    return 'deleted';
  } catch {
    // Fall through to the other known receipts.
  }
  try {
    await waitFor(element(by.text('Already deleted')))
      .toBeVisible()
      .withTimeout(3000);
    await dismissSuccessAlert();
    return 'already_deleted';
  } catch {
    // Fall through to the stale-guard receipt.
  }
  await waitFor(element(by.text('Balance changed')))
    .toBeVisible()
    .withTimeout(5000);
  return 'stale';
}

async function deleteFriendSettlementOperation(operationId) {
  const card = element(by.id(`friend-settlement-operation-${operationId}`));
  await waitFor(card).toBeVisible().withTimeout(15000);
  // Delete is swipe-only — reveal the swipe action before tapping.
  await card.swipe('left', 'slow', 0.55);
  const deleteButton = element(by.id(`delete-settlement-operation-${operationId}`));
  await waitFor(deleteButton).toBeVisible().withTimeout(5000);
  await deleteButton.tap();
  await confirmDeleteAlert();
  return awaitDeleteOutcome();
}

async function deleteGroupSettlementOperation(operationId) {
  const card = element(by.id(`group-settlement-operation-${operationId}`));
  await waitFor(card).toBeVisible().withTimeout(15000);
  // Delete is swipe-only — reveal the swipe action before tapping.
  await card.swipe('left', 'slow', 0.55);
  const deleteButton = element(by.id(`delete-group-settlement-operation-${operationId}`));
  await waitFor(deleteButton).toBeVisible().withTimeout(5000);
  await deleteButton.tap();
  await confirmDeleteAlert();
  return awaitDeleteOutcome();
}

module.exports = {
  awaitDeleteOutcome,
  confirmDeleteAlert,
  deleteFriendSettlementOperation,
  deleteGroupSettlementOperation,
  expandFriendDetailsIfNeeded,
  expandGroupDetailsIfNeeded,
};
