const { loginToFriends } = require('./helpers/auth');

describe('Authentication', () => {
  beforeAll(async () => {
    // Clean install so the sign-in screen is guaranteed regardless of the
    // session left behind by previously-run test files.
    await device.launchApp({
      delete: true,
      permissions: { notifications: 'NO' },
    });
  });

  it('shows the sign-in contract and accepts email input', async () => {
    await expect(element(by.text('Welcome back'))).toBeVisible();
    await expect(element(by.text('Email'))).toBeVisible();
    await expect(element(by.text('Continue'))).toBeVisible();
    const emailInput = element(by.id('sign-in-email-input'));
    await emailInput.tap();
    await emailInput.typeText('tester@example.com');
    await expect(emailInput).toHaveText('tester@example.com');
  });

  it('signs in the configured E2E account and reaches Friends', async () => {
    await loginToFriends();
  });
});
