const { loginToFriends } = require('./helpers/auth');

describe('Authentication', () => {
  beforeAll(async () => {
    await device.launchApp();
  });

  it('shows the sign-in screen', async () => {
    await expect(element(by.text('Welcome back'))).toBeVisible();
    await expect(element(by.text('Email'))).toBeVisible();
    await expect(element(by.text('Continue'))).toBeVisible();
  });

  it('accepts email text input', async () => {
    const emailInput = element(by.id('sign-in-email-input'));
    await emailInput.tap();
    await emailInput.typeText('tester@example.com');
    await expect(emailInput).toHaveText('tester@example.com');
  });

  it('signs in the configured E2E account and reaches Friends', async () => {
    await loginToFriends();
  });
});
