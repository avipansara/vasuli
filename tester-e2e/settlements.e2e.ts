import { test } from '@e2e-dev/mobile';
import { expect } from 'e2e';
import { fixtures, groupCard, openSignedInApp, openTab } from './helpers';

test('a full group payment records the seeded balance and returns to group details', async ({ app, screen, device }) => {
  const testKey = 'tester-army-group-settlement';
  const fixture = await fixtures.seedOutstandingGroup({ testKey });
  try {
    await openSignedInApp(app, screen, device);
    await openTab(screen, 'Groups');
    await groupCard(screen, fixture.groupName!).tap();
    await screen.getByLabel(`Settle up in ${fixture.groupName}`).tap();
    await expect(screen.getByText('Choose someone to settle with')).toBeVisible();
    await screen.getByLabel(`Select ${fixture.friendName} to settle $12.00`).tap();
    await screen.getByLabel('Settle the full group balance').tap();
    await screen.getByTestId('group-record-settlement-button').tap();

    await expect(screen.getByText('Settlement recorded')).toBeVisible({ timeout: 20_000 });
    await screen.getByTestId('group-settlement-done-button').tap();
    await expect(screen.getByText(fixture.groupName!)).toBeVisible();
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
    const friend = screen.getByText(fixture.friendName!);
    if (!(await friend.isVisible())) {
      await screen.getByText(/^Settled Up \(\d+\)$/).tap();
    }
    await screen.getByText(fixture.friendName!).tap();
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
