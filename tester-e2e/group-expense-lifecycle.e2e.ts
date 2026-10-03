import { test } from '@e2e-dev/mobile';
import { expect } from 'e2e';
import { fixtures, groupCard, openSignedInApp, openTab, replaceText } from './helpers';

const testKey = 'tester-army-group-expense-lifecycle';

test('a seeded group member can add and edit a group expense', async ({ app, screen, device }) => {
  const fixture = await fixtures.seedGroupMembership({ testKey });
  try {
    await openSignedInApp(app, screen, device);
    await openTab(screen, 'Groups');
    await groupCard(screen, fixture.groupName!).tap();
    await expect(screen.getByLabel(new RegExp(fixture.friendName!))).toBeVisible();

    await screen.getByLabel('Add expense').tap();
    await screen.getByLabel(`Select group ${fixture.groupName}`).tap();
    await screen.getByTestId('add-expense-next-button').tap();
    const amount = screen.getByTestId('expense-amount-input');
    await expect(amount).toBeVisible();
    await amount.tap();
    await amount.pressSequentially('12.00');

    const description = `TesterArmy group ${process.env.E2E_RUN_ID} ${Date.now()}`;
    const descriptionInput = screen.getByTestId('expense-description-input');
    await screen.scrollUntilVisible(descriptionInput);
    await descriptionInput.tap();
    await descriptionInput.pressSequentially(description);
    await screen.getByTestId('add-expense-submit-button').tap();

    const expenseRow = screen.getByLabel(`View details for ${description}`);
    await expect(expenseRow).toBeVisible({ timeout: 20_000 });
    await expenseRow.tap();
    await expect(screen.getByTestId('expense-detail-edit-button')).toBeVisible();
    await screen.getByTestId('expense-detail-edit-button').tap();
    await expect(screen.getByTestId('edit-expense-amount-input')).toBeVisible();
    await replaceText(screen.getByTestId('edit-expense-amount-input'), 5, '24.50');
    await screen.getByTestId('edit-expense-save-button').tap();
    await expect(screen.getByText('$24.50')).toBeVisible({ timeout: 20_000 });
    await screen.getByTestId('expense-detail-delete-button').tap();
    await expect(screen.getByText('Delete Expense')).toBeVisible();
    await screen.getByRole('button', 'Delete').tap();
    await expect(expenseRow).toBeHidden({ timeout: 20_000 });
  } finally {
    await fixtures.purgeFixtureRun({ testKey });
  }
});

// Seeded stats route test requires a clean friend without existing settlement records in dev DB
test('the group list opens a seeded group stats route', async ({ app, screen, device }) => {
  const testKey = 'tester-army-group-stats';
  let fixture;
  try {
    fixture = await fixtures.seedOutstandingGroup({ testKey });
  } catch (err) {
    if (err?.message?.includes('E2E_FIXTURE_CLEAN_FRIEND_NOT_FOUND')) {
      test.skip();
      return;
    }
    throw err;
  }
  try {
    await openSignedInApp(app, screen, device);
    await openTab(screen, 'Groups');
    await groupCard(screen, fixture.groupName!).tap();
    await expect(screen.getByLabel(new RegExp(`${fixture.groupName}, .*members`))).toBeVisible();
    await screen.getByText('Stats').tap();
    await expect(screen.getByText('Group stats')).toBeVisible();
    await expect(screen.getByText(fixture.groupName!)).toBeVisible();
    await expect(screen.getByText('Total spent')).toBeVisible();
    await expect(screen.getByText('$12.00').first()).toBeVisible();
  } finally {
    await fixtures.purgeFixtureRun({ testKey });
  }
});
