import { test } from '@e2e-dev/mobile';
import { expect } from 'e2e';
import { fixtures, groupCard, openSignedInApp, openTab } from './helpers';

test('a weekly recurring expense can be reviewed and cancelled before saving', async ({ app, screen, device }) => {
  const testKey = 'tester-army-recurring-review';
  const fixture = await fixtures.seedGroupMembership({ testKey });
  try {
    await openSignedInApp(app, screen, device);
    await openTab(screen, 'Groups');
    await groupCard(screen, fixture.groupName!).tap();
    await screen.getByLabel('Add expense').tap();
    await screen.getByLabel(`Select group ${fixture.groupName}`).tap();
    await screen.getByTestId('add-expense-next-button').tap();
    await screen.getByTestId('expense-amount-input').tap();
    await screen.getByTestId('expense-amount-input').pressSequentially('120.00');

    const description = `TesterArmy weekly ${process.env.E2E_RUN_ID}`;
    const descriptionInput = screen.getByTestId('expense-description-input');
    await screen.scrollUntilVisible(descriptionInput);
    await descriptionInput.tap();
    await descriptionInput.pressSequentially(description);
    await screen.scrollUntilVisible(screen.getByTestId('expense-repeat-weekly'));
    await screen.getByTestId('expense-repeat-weekly').tap();
    await expect(screen.getByLabel('Review recurring expense')).toBeVisible();
    await screen.getByLabel('Review recurring expense').tap();

    await expect(screen.getByTestId('recurring-expense-review-sheet')).toBeVisible();
    await expect(screen.getByText('Save recurring expense')).toBeVisible();
    await screen.getByTestId('recurring-review-cancel').tap();
    await expect(screen.getByTestId('recurring-expense-review-sheet')).toBeHidden();
  } finally {
    await fixtures.purgeFixtureRun({ testKey });
  }
});

test('Activity opens the recurring expense management route', async ({ app, screen, device }) => {
  await openSignedInApp(app, screen, device);
  await openTab(screen, 'Activity');
  await screen.getByLabel('Recurring expenses').tap();
  await expect(screen.getByText('Recurring expenses').first()).toBeVisible();
  await expect(screen.getByTestId('recurring-add-button')).toBeVisible();
});

test('a saved weekly recurring expense can be paused', async ({ app, screen, device }) => {
  if (process.env.E2E_RECURRING_PERSISTENCE !== '1') {
    test.skip();
    return;
  }
  const testKey = 'tester-army-recurring-pause';
  const fixture = await fixtures.seedGroupMembership({ testKey });
  try {
    await openSignedInApp(app, screen, device);
    await openTab(screen, 'Groups');
    await groupCard(screen, fixture.groupName!).tap();
    await screen.getByLabel('Add expense').tap();
    await screen.getByLabel(`Select group ${fixture.groupName}`).tap();
    await screen.getByTestId('add-expense-next-button').tap();
    await screen.getByTestId('expense-amount-input').tap();
    await screen.getByTestId('expense-amount-input').pressSequentially('24.00');
    const description = `TesterArmy recurring ${process.env.E2E_RUN_ID}`;
    const descriptionInput = screen.getByTestId('expense-description-input');
    await screen.scrollUntilVisible(descriptionInput);
    await descriptionInput.tap();
    await descriptionInput.pressSequentially(description);
    await screen.scrollUntilVisible(screen.getByTestId('expense-repeat-weekly'));
    await screen.getByTestId('expense-repeat-weekly').tap();
    await screen.getByLabel('Review recurring expense').tap();
    await expect(screen.getByTestId('recurring-expense-review-sheet')).toBeVisible();
    await screen.getByTestId('save-recurring-expense-button').tap();
    await expect(screen.getByLabel('View recurring expenses')).toBeVisible({ timeout: 20_000 });
    // Let the saved-state card finish its entrance animation before the tap.
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await screen.getByLabel('View recurring expenses').tap();
    const rule = screen.getByLabel(new RegExp(`^${description},`));
    await expect(rule).toBeVisible({ timeout: 20_000 });
    await rule.tap();
    const pause = screen.getByTestId('pause-recurring-rule-button');
    await screen.scrollUntilVisible(pause);
    await pause.tap();
    await expect(screen.getByTestId('resume-recurring-rule-button')).toBeVisible({ timeout: 20_000 });
  } finally {
    await fixtures.purgeFixtureRun({ testKey });
  }
});
