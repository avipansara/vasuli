import { afterEach, describe, expect, it, vi } from 'vitest';

const mockConstants = vi.hoisted(() => ({
  expoConfig: { version: '1.0.5' } as { version?: string },
  executionEnvironment: 'standalone' as string,
}));

const mockApplication = vi.hoisted(() => ({
  nativeApplicationVersion: null as string | null,
  nativeBuildVersion: null as string | null,
}));

const mockPlatformOS = vi.hoisted(() => ({ value: 'ios' as 'ios' | 'android' | 'web' }));

vi.mock('react-native', () => ({
  Platform: { get OS() { return mockPlatformOS.value; } },
}));

vi.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return mockConstants.expoConfig;
    },
    get executionEnvironment() {
      return mockConstants.executionEnvironment;
    },
  },
  ExecutionEnvironment: {
    StoreClient: 'storeClient',
    Standalone: 'standalone',
    Bare: 'bare',
  },
}));

vi.mock('expo-application', () => ({
  get nativeApplicationVersion() {
    return mockApplication.nativeApplicationVersion;
  },
  get nativeBuildVersion() {
    return mockApplication.nativeBuildVersion;
  },
}));

describe('getAppVersionLabel', () => {
  afterEach(() => {
    vi.resetModules();
    mockConstants.expoConfig = { version: '1.0.5' };
    mockConstants.executionEnvironment = 'standalone';
    mockApplication.nativeApplicationVersion = null;
    mockApplication.nativeBuildVersion = null;
    mockPlatformOS.value = 'ios';
  });

  it('uses expoConfig version on web', async () => {
    mockPlatformOS.value = 'web';
    const { getAppVersionLabel } = await import('./app-version');
    expect(getAppVersionLabel()).toBe('Version 1.0.5');
  });

  it('uses expoConfig version in Expo Go (store client)', async () => {
    mockPlatformOS.value = 'ios';
    mockConstants.executionEnvironment = 'storeClient';
    mockApplication.nativeApplicationVersion = '99.0.0';
    mockApplication.nativeBuildVersion = '999';
    const { getAppVersionLabel } = await import('./app-version');
    expect(getAppVersionLabel()).toBe('Version 1.0.5');
  });

  it('uses native version + build in standalone', async () => {
    mockPlatformOS.value = 'ios';
    mockConstants.executionEnvironment = 'standalone';
    mockApplication.nativeApplicationVersion = '1.0.5';
    mockApplication.nativeBuildVersion = '42';
    const { getAppVersionLabel } = await import('./app-version');
    expect(getAppVersionLabel()).toBe('Version 1.0.5 (42)');
  });

  it('falls back to config when native version missing', async () => {
    mockPlatformOS.value = 'android';
    mockConstants.executionEnvironment = 'standalone';
    mockApplication.nativeApplicationVersion = null;
    mockApplication.nativeBuildVersion = null;
    mockConstants.expoConfig = { version: '3.1.0' };
    const { getAppVersionLabel } = await import('./app-version');
    expect(getAppVersionLabel()).toBe('Version 3.1.0');
  });
});
