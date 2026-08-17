export type StoreRelease = {
  id: string;
  version: string;
  minimumSupportedVersion: string;
  storeUrl: string;
  title: string;
  notes: string[];
};

export type AppUpdateDecision =
  | { kind: 'current' }
  | {
      kind: 'optional' | 'mandatory';
      releaseId: string;
      version: string;
      storeUrl: string;
      title: string;
      notes: string[];
    };

type AppUpdateInput = {
  installedVersion: string;
  release: StoreRelease;
};

function parseVersion(version: string): number[] {
  return version.split('.').map(part => Number.parseInt(part, 10));
}

function isValidVersion(version: string): boolean {
  return /^\d+(\.\d+)*$/.test(version) && parseVersion(version).every(Number.isInteger);
}

function compareVersions(left: string, right: string): number {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;
    if (leftPart !== rightPart) return leftPart > rightPart ? 1 : -1;
  }

  return 0;
}

export function getAppUpdateDecision({ installedVersion, release }: AppUpdateInput): AppUpdateDecision {
  if (
    !isValidVersion(installedVersion)
    || !isValidVersion(release.version)
    || !isValidVersion(release.minimumSupportedVersion)
    || !/^https?:\/\/\S+$/.test(release.storeUrl)
  ) {
    return { kind: 'current' };
  }

  if (compareVersions(installedVersion, release.version) >= 0) {
    return { kind: 'current' };
  }

  return {
    kind: compareVersions(installedVersion, release.minimumSupportedVersion) < 0
      ? 'mandatory'
      : 'optional',
    releaseId: release.id,
    version: release.version,
    storeUrl: release.storeUrl,
    title: release.title,
    notes: release.notes,
  };
}
