import { test } from '@e2e-dev/mobile';
import { expect } from 'e2e';
import { openSignedInApp } from './helpers';

test('the stable vasuli groups link opens the Groups tab on Android', { platforms: ['android'] }, async ({ app, screen, device }) => {
  await openSignedInApp(app, screen, device);
  await device.openLink('vasuli://groups');
  await expect(screen.getByLabel('Create Group')).toBeVisible({ timeout: 15_000 });
});
