import { test } from '@e2e-dev/mobile';
import { expect } from 'e2e';
import { openSignedInApp, openTab } from './helpers';

async function openProfile(app: Parameters<typeof openSignedInApp>[0], screen: Parameters<typeof openSignedInApp>[1], device: Parameters<typeof openSignedInApp>[2]) {
  await openSignedInApp(app, screen, device);
  await openTab(screen, 'Profile');
  await expect(screen.getByText('Settings')).toBeVisible();
}

test('a restored or OTP-authenticated session reaches Friends', async ({ app, screen, device }) => {
  await openSignedInApp(app, screen, device);
  await expect(screen.getByTestId('friends-screen')).toBeVisible();
});

test('Profile opens account editing', async ({ app, screen, device }) => {
  await openProfile(app, screen, device);
  await screen.getByLabel('Edit profile').tap();
  await expect(screen.getByText('Edit Profile')).toBeVisible();
});

test('Profile opens Invitations', async ({ app, screen, device }) => {
  await openProfile(app, screen, device);
  await screen.getByText('Invitations').tap();
  await expect(screen.getByText('Invitations')).toBeVisible();
});

test('Profile opens Add people', async ({ app, screen, device }) => {
  await openProfile(app, screen, device);
  await screen.getByText('Invite a Friend').tap();
  await expect(screen.getByText('Add people')).toBeVisible();
});

test('Profile opens privacy policy', async ({ app, screen, device }) => {
  await openProfile(app, screen, device);
  await screen.getByText('Privacy Policy').tap();
  await expect(screen.getByText('Information We Collect')).toBeVisible();
});

test('Profile opens terms and conditions', async ({ app, screen, device }) => {
  await openProfile(app, screen, device);
  await screen.getByText('Terms & Conditions').tap();
  await expect(screen.getByText('Financial Disclaimer')).toBeVisible();
});

test('Profile opens Help and Support', async ({ app, screen, device }) => {
  await openProfile(app, screen, device);
  await screen.getByText('Help & Support').tap();
  await expect(screen.getByText('Frequently Asked Questions')).toBeVisible();
});

test('sign-in keeps Continue disabled for a malformed email', async ({ app, screen, device }) => {
  const appearance = process.env.E2E_APPEARANCE;
  if (appearance === 'light' || appearance === 'dark') await device.setAppearance(appearance);
  await device.installApp();
  await app.clearState();
  await app.open();
  await expect(screen.getByText('Welcome back')).toBeVisible();
  const continueButton = screen.getByTestId('send-sign-in-code-button');
  await expect(continueButton).toBeDisabled();
  const email = screen.getByTestId('sign-in-email-input');
  await email.tap();
  await email.pressSequentially('qa-flow@example.com');
  await expect(continueButton).toBeEnabled();
  await email.pressSequentially('@');
  await expect(continueButton).toBeDisabled();
});
