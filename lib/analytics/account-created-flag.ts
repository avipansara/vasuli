import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Pending `account created` marker, bound to the application user UUID that
 * was created.
 *
 * Set when profile creation succeeds (the only creation outcome), consumed
 * exactly once by the analytics provider after identity is ready and only for
 * the same user. Login, token refresh, remount, foreground, and profile
 * refresh never set it, so repeat sign-ins cannot restart the activation
 * window. Binding prevents account switching from attributing one person's
 * creation event to another person.
 */

const STORAGE_KEY = 'vasuli:pending-account-created';

export async function markAccountCreated(userId: string): Promise<void> {
  if (!userId) return;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, userId);
  } catch {
    // best-effort
  }
}

export async function consumeAccountCreated(expectedUserId: string): Promise<boolean> {
  if (!expectedUserId) return false;
  try {
    const value = await AsyncStorage.getItem(STORAGE_KEY);
    if (value === null) return false;
    if (value === expectedUserId) {
      await AsyncStorage.removeItem(STORAGE_KEY);
      return true;
    }
    if (value === 'true') {
      // Legacy global marker with no identity: unattributable, drop it rather
      // than emitting `account created` for whoever signs in next.
      await AsyncStorage.removeItem(STORAGE_KEY);
    }
    // A different user's pending marker survives so they still emit exactly
    // once when they sign back in on this device.
    return false;
  } catch {
    return false;
  }
}
