const LAUNCH_PERMISSIONS = { notifications: 'NO' };

async function launchSignedIn() {
  // Fast path: the Supabase session persists in AsyncStorage across relaunches
  // (requires behavior.init.reinstallApp=false in .detoxrc.js, otherwise
  // Detox wipes app data at every test-file boundary).
  await device.launchApp({
    newInstance: true,
    permissions: LAUNCH_PERMISSIONS,
  });
  await waitFor(element(by.id('friends-screen')))
    .toBeVisible()
    .withTimeout(5000);
}

async function loginToFriends() {
  try {
    await launchSignedIn();
    return;
  } catch {
    // No usable session (fresh install, signed out, or slow restore) — fall
    // through to the full OTP sign-in below.
  }

  const email = process.env.EXPO_PUBLIC_TEST_ACCOUNT_EMAIL;
  const otp = process.env.EXPO_PUBLIC_TEST_ACCOUNT_OTP;

  if (!email || !otp) {
    throw new Error(
      'Set EXPO_PUBLIC_TEST_ACCOUNT_EMAIL and EXPO_PUBLIC_TEST_ACCOUNT_OTP before running E2E tests.',
    );
  }

  await device.launchApp({
    delete: true,
    newInstance: true,
    permissions: LAUNCH_PERMISSIONS,
  });
  await element(by.id('sign-in-email-input')).typeText(email);
  await device.disableSynchronization();
  try {
    await element(by.id('send-sign-in-code-button')).tap();
    await waitFor(element(by.id('sign-in-otp-0')))
      .toBeVisible()
      .withTimeout(5000);
    for (const [index, digit] of [...otp].entries()) {
      const otpInput = element(by.id(`sign-in-otp-${index}`));
      await otpInput.tap();
      await otpInput.typeText(digit);
    }
    try {
      await waitFor(element(by.label('Not now')))
        .toBeVisible()
        .withTimeout(5000);
      await element(by.label('Not now')).tap();
      await waitFor(element(by.label('Not now')))
        .toBeNotVisible()
        .withTimeout(5000);
    } catch {
      try {
        await waitFor(element(by.text('Not now')))
          .toBeVisible()
          .withTimeout(1500);
        await element(by.text('Not now')).tap();
      } catch {
        // Notification onboarding is shown only on some simulator launches.
      }
    }
    await waitFor(element(by.id('friends-screen')))
      .toBeVisible()
      .withTimeout(10000);
  } finally {
    await device.enableSynchronization();
  }
}

async function openGroups() {
  // iOS 26 exposes the NativeTabs button frame at the top of the screen,
  // but Detox calculates its accessibility hit point at the bottom.
  await device.tap({ x: 137, y: 822 });
  await expect(element(by.label('Create group'))).toBeVisible();
}

async function openFriends() {
  // Same NativeTabs workaround as openGroups; Friends is the first tab.
  await device.tap({ x: 50, y: 822 });
  await waitFor(element(by.id('friends-screen')))
    .toBeVisible()
    .withTimeout(10000);
}

async function openActivity() {
  // Same NativeTabs workaround as openGroups; Activity is the third tab.
  await device.tap({ x: 251, y: 822 });
  await waitFor(element(by.id('activity-search-input')))
    .toBeVisible()
    .withTimeout(10000);
}

async function goBack() {
  await element(by.label('Go back')).atIndex(0).tap();
}

module.exports = { goBack, loginToFriends, openActivity, openFriends, openGroups };
