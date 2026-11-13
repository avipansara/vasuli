import { test } from '@e2e-dev/mobile';
import { expect } from 'e2e';
import { fixtures, groupCard, openSignedInApp, openTab } from './helpers';

test('group expense custom split accepts exact participant amounts', async ({ app, screen, device }) => {
  const testKey = 'tester-army-custom-split';
  const fixture = await fixtures.seedGroupMembership({ testKey });
  try {
    await openSignedInApp(app, screen, device);
    await openTab(screen, 'Groups');
    await groupCard(screen, fixture.groupName!).tap();
    await screen.getByLabel('Add expense').tap();
    await screen.getByLabel(`Select group ${fixture.groupName}`).tap();
    await screen.getByTestId('add-expense-next-button').tap();
    const amount = screen.getByTestId('expense-amount-input');
    await amount.tap();
    await amount.pressSequentially('20.00');
    await new Promise((resolve) => setTimeout(resolve, 600));
    try {
      await screen.scrollUntilVisible(screen.getByTestId('expense-description-input'));
    } catch {
      await screen.getByText('Description').tap().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 400));
      await screen.scrollUntilVisible(screen.getByTestId('expense-description-input'));
    }
    const description = `TesterArmy split ${process.env.E2E_RUN_ID}`;
    const descriptionInput = screen.getByTestId('expense-description-input');
    await descriptionInput.tap();
    await descriptionInput.pressSequentially(description);
    await screen.scrollUntilVisible(screen.getByLabel('Split method Unequal'));
    await screen.getByLabel('Split method Unequal').tap();
    await screen.scrollUntilVisible(screen.getByTestId('custom-split-you-input'));
    const youShare = screen.getByTestId('custom-split-you-input');
    await youShare.tap();
    await youShare.pressSequentially('14.50');
    const friendShare = screen.getByTestId('custom-split-participant-input').first();
    await friendShare.tap();
    await friendShare.pressSequentially('5.50');
    await screen.getByTestId('add-expense-submit-button').tap();
    await expect(screen.getByLabel(`View details for ${description}`)).toBeVisible({ timeout: 20_000 });
  } finally {
    await fixtures.purgeFixtureRun({ testKey });
  }
});

test('group expense payer selection is reflected in expense details', async ({ app, screen, device }) => {
  const testKey = 'tester-army-payer-selection';
  const fixture = await fixtures.seedGroupMembership({ testKey });
  try {
    await openSignedInApp(app, screen, device);
    await openTab(screen, 'Groups');
    await groupCard(screen, fixture.groupName!).tap();
    await screen.getByLabel('Add expense').tap();
    await screen.getByLabel(`Select group ${fixture.groupName}`).tap();
    await screen.getByTestId('add-expense-next-button').tap();
    await expect(screen.getByLabel(`Paid by ${fixture.friendName}`)).toBeVisible();
    await screen.getByLabel(`Paid by ${fixture.friendName}`).tap();
    const amount = screen.getByTestId('expense-amount-input');
    await amount.tap();
    await amount.pressSequentially('9.00');
    // Keyboard can cover the description field on CI; give it time to settle
    await new Promise((resolve) => setTimeout(resolve, 800));
    try {
      await screen.scrollUntilVisible(screen.getByTestId('expense-description-input'));
    } catch {
      // Fallback: tap outside to dismiss keyboard then retry
      await screen.getByText('Description').tap().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 500));
      await screen.scrollUntilVisible(screen.getByTestId('expense-description-input'));
    }
    const description = `TesterArmy payer ${process.env.E2E_RUN_ID}`;
    const descriptionInput = screen.getByTestId('expense-description-input');
    await descriptionInput.tap();
    await descriptionInput.pressSequentially(description);
    await screen.getByTestId('add-expense-submit-button').tap();
    const row = screen.getByLabel(`View details for ${description}`);
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.tap();
    await expect(screen.getByLabel(new RegExp(fixture.friendName!)).first()).toBeVisible({ timeout: 20_000 });
  } finally {
    await fixtures.purgeFixtureRun({ testKey });
  }
});
