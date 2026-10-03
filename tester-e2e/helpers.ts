import { expect, type Screen } from 'e2e';
import * as fixtures from '../e2e/helpers/fixtures.js';

export { fixtures };

export function groupCard(screen: Screen, groupName: string) {
  const escapedName = groupName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return screen.getByLabel(new RegExp(`^${escapedName},`));
}

export function friendCard(screen: Screen, friendName: string) {
  const escapedName = friendName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return screen.getByLabel(new RegExp(escapedName));
}

export async function dismissNotificationPrompt(screen: Screen) {
  const notNow = screen.getByRole('button', 'Not now');
  if (await notNow.isVisible()) {
    await notNow.tap();
  }
  const notNowText = screen.getByText('Not now');
  if (await notNowText.isVisible()) {
    await notNowText.tap();
  }
}

export async function openSignedInApp(
  app: { open(): Promise<void> },
  screen: Screen,
  device: { installApp(): Promise<unknown>; setAppearance(mode: 'light' | 'dark'): Promise<unknown> },
) {
  const appearance = process.env.E2E_APPEARANCE;
  if (appearance === 'light' || appearance === 'dark') await device.setAppearance(appearance);
  await device.installApp();
  await app.open();

  const okButton = screen.getByRole('button', 'OK');
  if (await okButton.isVisible()) await okButton.tap();

  await dismissNotificationPrompt(screen);

  const signInState = async () => {
    if (await screen.getByTestId('friends-screen').isVisible()) return 'signed-in';
    if (await screen.getByTestId('sign-in-email-input').isVisible()) return 'signed-out';
    if (await screen.getByTestId('sign-in-otp-0').isVisible()) return 'otp-step';
    if (await screen.getByText('Welcome back').isVisible()) return 'signed-out';
    return '';
  };
  await expect.poll(signInState, { timeout: 20_000 }).not.toBe('');
  const currentState = await signInState();
  if (currentState === 'signed-in') {
    await dismissNotificationPrompt(screen);
    return;
  }

  const email = process.env.EXPO_PUBLIC_TEST_ACCOUNT_EMAIL;
  const otp = process.env.EXPO_PUBLIC_TEST_ACCOUNT_OTP;
  if (!email || !otp) {
    throw new Error('Set the approved development E2E account email and OTP before running device flows.');
  }

  if (currentState !== 'otp-step') {
    const emailInput = screen.getByTestId('sign-in-email-input');
    await expect(emailInput).toBeVisible({ timeout: 10_000 });
    await emailInput.tap();
    await emailInput.pressSequentially(email);
    await screen.getByTestId('send-sign-in-code-button').tap();
  }

  await expect(screen.getByTestId('sign-in-otp-0')).toBeVisible({ timeout: 15_000 });
  for (const [index, digit] of [...otp].entries()) {
    const input = screen.getByTestId(`sign-in-otp-${index}`);
    await input.tap();
    await input.pressSequentially(digit);
  }
  const verifyButton = screen.getByTestId('sign-in-button');
  if (await verifyButton.isVisible() && await verifyButton.isEnabled()) {
    await verifyButton.tap();
  }
  await dismissNotificationPrompt(screen);
  await expect(screen.getByTestId('friends-screen')).toBeVisible({ timeout: 20_000 });
  await dismissNotificationPrompt(screen);
}

export async function replaceText(locator: { clear?: () => Promise<unknown>; fill: (text: string) => Promise<unknown> }, _oldLength: number, value: string) {
  if (typeof locator.clear === 'function') {
    try {
      await locator.clear();
    } catch {
      // Fall through to fill
    }
  }
  await locator.fill(value);
}

export async function openTab(screen: Screen, label: 'Friends' | 'Groups' | 'Activity' | 'Profile') {
  await dismissNotificationPrompt(screen);
  await screen.getByText(label, { visible: true }).last().tap();
  const routeMarker = {
    Friends: screen.getByTestId('friends-screen'),
    Groups: screen.getByLabel('Create Group'),
    Activity: screen.getByTestId('activity-search-input'),
    Profile: screen.getByText('Account'),
  }[label];
  await expect(routeMarker).toBeVisible({ timeout: 15_000 });
}

export async function openProfile(
  app: { open(): Promise<void> },
  screen: Screen,
  device: { installApp(): Promise<unknown>; setAppearance(mode: 'light' | 'dark'): Promise<unknown> },
) {
  await openSignedInApp(app, screen, device);
  await openTab(screen, 'Profile');
}
