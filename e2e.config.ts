import type { E2EConfig } from 'e2e';
import { mobile } from '@e2e-dev/mobile';

export default {
  targets: [
    {
      name: 'ios',
      engine: mobile({ platform: 'ios', device: process.env.E2E_IOS_DEVICE }),
      app: {
        bundleId: 'com.avipansara.vasuli',
        appPath: 'ios/build/Build/Products/Release-iphonesimulator/Vasuli.app',
      },
    },
    {
      name: 'android',
      engine: mobile({ platform: 'android', device: process.env.E2E_ANDROID_DEVICE }),
      app: {
        bundleId: 'com.avipansara.vasuli',
        appPath: 'android/app/build/outputs/apk/release/app-release.apk',
      },
    },
  ],
  tests: 'tester-e2e/**/*.e2e.ts',
  workers: 1,
  retries: 0,
  timeout: 120_000,
  launchTimeout: 300_000,
  actionTimeout: 30_000,
  assertionTimeout: 10_000,
  cleanupTimeout: 60_000,
  trace: 'on-first-retry',
  secrets: {
    supabaseUrl: () => process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
    supabaseKey: () => process.env.EXPO_PUBLIC_SUPABASE_KEY ?? '',
    testAccountEmail: () => process.env.EXPO_PUBLIC_TEST_ACCOUNT_EMAIL ?? '',
    testAccountOtp: () => process.env.EXPO_PUBLIC_TEST_ACCOUNT_OTP ?? '',
  },
} satisfies E2EConfig;
