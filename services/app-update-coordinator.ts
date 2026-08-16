import { getAppUpdateDecision, type AppUpdateDecision, type StoreRelease } from '@/lib/app-update';

type AppUpdateCoordinatorInput = {
  installedVersion: string | null;
  platform: 'ios' | 'android';
  getActiveRelease: (platform: 'ios' | 'android', channel?: string) => Promise<StoreRelease | null>;
  channel?: string;
};

export async function checkForAppUpdate({
  installedVersion,
  platform,
  getActiveRelease,
  channel = 'production',
}: AppUpdateCoordinatorInput): Promise<AppUpdateDecision> {
  if (!installedVersion) return { kind: 'current' };

  const release = await getActiveRelease(platform, channel);
  if (!release) return { kind: 'current' };

  return getAppUpdateDecision({ installedVersion, release });
}
