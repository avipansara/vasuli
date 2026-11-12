import { test } from '@e2e-dev/mobile';
import { expect } from 'e2e';
import { fixtures, friendCard, groupCard, openSignedInApp, openTab } from './helpers';

test('a full group payment records the seeded balance and returns to group details', async ({ app, screen, device }) => {
  const testKey = 'tester-army-group-settlement';
  const fixture = await fixtures.seedOutstandingGroup({ testKey });
  try {
    await openSignedInApp(app, screen, device);
    await openTab(screen, 'Groups');
    await groupCard(screen, fixture.groupName!).tap();
    const settle = screen.getByLabel(`Settle up in ${fixture.groupName}`);
    await screen.scrollUntilVisible(settle, { direction: 'up' });
    await settle.tap();
    await expect(screen.getByText(/^choose someone to settle with$/i).first()).toBeVisible();
    await screen.getByLabel(`Select ${fixture.friendName} to settle $12.00`).tap();
    await screen.getByLabel('Settle the full group balance').tap();
    await screen.getByTestId('group-record-settlement-button').tap();

    await expect(screen.getByText('Settlement recorded')).toBeVisible({ timeout: 20_000 });
    // The receipt can appear before its presentation transition accepts taps.
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await screen.getByTestId('group-settlement-done-button').tap();
    await expect(screen.getByText(fixture.groupName!).first()).toBeVisible();
  } finally {
    await fixtures.purgeFixtureRun({ testKey });
  }
});

test('friend settlement commits the seeded combined amount', async ({ app, screen, device }) => {
  const testKey = 'tester-army-friend-settlement';
  const fixture = await fixtures.seedOutstandingGroup({ testKey });
  try {
    await openSignedInApp(app, screen, device);
    await openTab(screen, 'Friends');
    const friend = friendCard(screen, fixture.friendName!).first();
    await expect(friend).toBeVisible({ timeout: 20_000 });
    await friend.tap();
    await screen.getByLabel(`Settle up with ${fixture.friendName}`).tap();

    await expect(screen.getByTestId('friend-settlement-relationship-summary')).toContainText('$12.00');
    await screen.getByLabel('Settle the full balance').tap();
    await screen.getByTestId('friend-settlement-record-button').tap();
    await expect(screen.getByTestId('friend-settlement-confirmation')).toBeVisible();
    await expect(screen.getByTestId('friend-settlement-confirm-button')).toBeVisible();
    await screen.getByTestId('friend-settlement-confirm-button').tap();
    await expect(screen.getByTestId('friend-settlement-success')).toBeVisible({ timeout: 20_000 });
    await screen.getByTestId('friend-settlement-done-button').tap();
    await expect(screen.getByLabel('Activity filter')).toBeVisible();
  } finally {
    await fixtures.purgeFixtureRun({ testKey });
  }
});

test('deleting a settlement restores the friend balance', async ({ app, screen, device }) => {
  const testKey = 'tester-army-settlement-reversal';
  const fixture = await fixtures.seedSettlementReversal({ testKey });
  try {
    await openSignedInApp(app, screen, device);
    await openTab(screen, 'Friends');
    const friend = friendCard(screen, fixture.friendName!).first();
    if (!(await friend.isVisible())) {
      const settled = screen.getByLabel(/Settled Up \(\d+\)/i).first();
      await screen.scrollUntilVisible(settled);
      await settled.tap();
    }
    await expect(friend).toBeVisible({ timeout: 20_000 });
    await friend.tap();
    await screen.getByLabel('Updates').tap();
    const operation = screen.getByTestId(`friend-settlement-operation-${fixture.operationId}`);
    await screen.scrollUntilVisible(operation);
    // Let the Updates tab finish its entrance transition before swiping.
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const box = await operation.boundingBox();
    if (!box) throw new Error('Settlement card has no bounds for the delete swipe.');
    await screen.swipe({
      from: { x: box.x + box.width * 0.8, y: box.y + box.height / 2 },
      to: { x: box.x + box.width * 0.2, y: box.y + box.height / 2 },
    });
    await screen.getByTestId(`delete-settlement-operation-${fixture.operationId}`).tap();
    await screen.getByTestId(`settlement-delete-confirm-${fixture.operationId}`).tap();
    await expect(screen.getByText('Settlement deleted')).toBeVisible({ timeout: 20_000 });
    await screen.getByTestId(`settlement-delete-result-primary-${fixture.operationId}`).tap();
    await expect(screen.getByLabel(/owes you, \$12\.00/).first()).toBeVisible({ timeout: 20_000 });
    await expect(screen.getByLabel(/paid you.*Deleted/)).toBeVisible();
  } finally {
    await fixtures.purgeFixtureRun({ testKey });
  }
});
