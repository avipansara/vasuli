import { test } from '@e2e-dev/mobile';
import { expect } from 'e2e';
import { fixtures, friendCard, openSignedInApp, openTab, replaceText } from './helpers';

const testKey = 'tester-army-direct-expense';

test('a friend expense appears on both the friend and Activity screens', async ({ app, screen, device }) => {
  const fixture = await fixtures.seedFriendship({ testKey });
  try {
    await openSignedInApp(app, screen, device);
    await openTab(screen, 'Friends');

    const friend = friendCard(screen, fixture.friendName!);
    if (!(await friend.isVisible())) {
      const settledAccordion = screen.getByText(/^Settled Up \(\d+\)$/);
      if (await settledAccordion.isVisible()) {
        await settledAccordion.tap();
      }
    }
    await friend.tap();
    await expect(screen.getByLabel('Activity filter')).toBeVisible();

    const description = `TesterArmy direct ${process.env.E2E_RUN_ID} ${Date.now()}`;
    await screen.getByLabel('Add expense').tap();
    await expect(screen.getByTestId('expense-amount-input')).toBeVisible();
    await screen.getByTestId('expense-amount-input').tap();
    await screen.getByTestId('expense-amount-input').pressSequentially('18.00');
    await screen.scrollUntilVisible(screen.getByTestId('expense-description-input'));
    await screen.getByTestId('expense-description-input').tap();
    await screen.getByTestId('expense-description-input').pressSequentially(description);
    await screen.getByTestId('add-expense-submit-button').tap();

    const activityRow = screen.getByLabel(new RegExp(`^${description}, .*you are owed`));
    await expect(activityRow).toBeVisible({ timeout: 20_000 });
    await activityRow.tap();
    await expect(screen.getByTestId('expense-detail-edit-button')).toBeVisible();
    await screen.getByTestId('expense-detail-edit-button').tap();
    const editAmount = screen.getByTestId('edit-expense-amount-input');
    await expect(editAmount).toBeVisible();
    await replaceText(editAmount, 5, '20.00');
    await screen.getByTestId('edit-expense-save-button').tap();
    await expect(screen.getByText('$20.00')).toBeVisible({ timeout: 20_000 });

    await screen.getByTestId('expense-detail-delete-button').tap();
    await expect(screen.getByText('Delete Expense')).toBeVisible();
    await screen.getByRole('button', 'Delete').tap();
    await expect(screen.getByLabel(new RegExp(`^Deleted ${description},`))).toBeVisible({ timeout: 20_000 });
    await screen.getByLabel('Go back').tap();
    await openTab(screen, 'Activity');
    const search = screen.getByTestId('activity-search-input');
    await search.tap();
    await search.pressSequentially(description);
    await expect(screen.getByText('Deleted')).toBeVisible({ timeout: 15_000 });
  } finally {
    await fixtures.purgeFixtureRun({ testKey });
  }
});
