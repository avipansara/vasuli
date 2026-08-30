/**
 * Normalize stable native links that target tab routes.
 *
 * The route-group syntax remains internal to Expo Router while native callers
 * can use the stable `vasuli://groups` URL.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    const url = new URL(path, 'vasuli://app.home');
    const isGroupsLink =
      url.hostname === 'groups' ||
      url.pathname === '/groups' ||
      url.pathname === '/(tabs)/groups';

    return isGroupsLink ? '/(tabs)/groups' : path;
  } catch {
    return '/';
  }
}
