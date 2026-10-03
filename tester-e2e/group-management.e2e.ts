import { test } from '@e2e-dev/mobile';
import { expect } from 'e2e';
import { groupCard, openSignedInApp, openTab, replaceText } from './helpers';

test('a group can be created, renamed from the list, and deleted from its detail screen', async ({ app, screen, device }) => {
  const runId = process.env.E2E_RUN_ID;
  if (!runId) throw new Error('Run this mutating flow through the TesterArmy wrapper so its group can be cleaned up.');

  await openSignedInApp(app, screen, device);
  await openTab(screen, 'Groups');

  const groupName = `Detox Group ${runId} TesterArmy ${Date.now()}`;
  await screen.getByLabel('Create Group').tap();
  await screen.getByTestId('create-group-name-input').tap();
  await screen.getByTestId('create-group-name-input').pressSequentially(groupName);
  await screen.getByTestId('create-group-submit-button').tap();

  const group = groupCard(screen, groupName);
  await expect(group).toBeVisible({ timeout: 15_000 });
  const box = await group.boundingBox();
  if (box) {
    await screen.swipe({
      from: { x: box.x + 20, y: box.y + box.height / 2 },
      to: { x: box.x + box.width - 20, y: box.y + box.height / 2 },
    });
  } else {
    await group.swipe({ direction: 'left', momentum: 'slow' });
  }
  await screen.getByLabel(`Edit ${groupName}`).tap();

  const renamed = `${groupName} Updated`;
  await expect(screen.getByTestId('edit-group-name-input')).toBeVisible();
  await replaceText(screen.getByTestId('edit-group-name-input'), groupName.length, renamed);
  await screen.getByTestId('edit-group-save-button').tap();
  await expect(groupCard(screen, renamed)).toBeVisible({ timeout: 15_000 });
  await groupCard(screen, renamed).tap();

  await screen.getByTestId('delete-group-button').tap();
  await expect(screen.getByText('Delete Group')).toBeVisible();
  await screen.getByRole('button', 'Delete').tap();
  await expect(screen.getByLabel(`Restore ${renamed}`)).toBeVisible({ timeout: 15_000 });
});
