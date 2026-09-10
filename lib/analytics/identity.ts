import { buildDistinctIdInput, buildGroupKeyInput } from './domains';

/**
 * Pseudonymous identity derivation.
 *
 * The raw Supabase user UUID never leaves the device as the PostHog distinct
 * ID, and raw group UUIDs never leave as group keys. Both are derived with a
 * versioned, domain-separated SHA-256 input so user and group namespaces can
 * never collide. The same person gets the same ID across devices within one
 * project; the result is still treated as personal data.
 *
 * `expo-crypto` is loaded lazily (never at module import) so a missing native
 * module — e.g. Expo Go or a dev client built before the package was added —
 * can never crash app startup. Hashing is only ever needed in
 * preview/production builds, which always include the native module.
 */

/** Domain-separated inputs live in `./domains` (pure, unit-tested). */
export { buildDistinctIdInput, buildGroupKeyInput } from './domains';

type ExpoCryptoModule = {
  digestStringAsync: (algorithm: unknown, message: string) => Promise<string>;
  CryptoDigestAlgorithm: { SHA256: unknown };
};

let cachedCrypto: ExpoCryptoModule | null = null;

function loadCrypto(): ExpoCryptoModule {
  if (cachedCrypto) return cachedCrypto;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const loaded = require('expo-crypto') as ExpoCryptoModule & { default?: ExpoCryptoModule };
    cachedCrypto = loaded.default ?? loaded;
    return cachedCrypto;
  } catch (error) {
    throw new Error(
      'expo-crypto native module is unavailable; rebuild the development client after installing native dependencies.',
    );
  }
}

async function sha256Hex(input: string): Promise<string> {
  const Crypto = loadCrypto();
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input);
}

export async function deriveDistinctId(userUuid: string): Promise<string> {
  if (!userUuid.trim()) throw new Error('deriveDistinctId requires a user UUID');
  return sha256Hex(buildDistinctIdInput(userUuid));
}

export async function deriveGroupKey(groupUuid: string): Promise<string> {
  if (!groupUuid.trim()) throw new Error('deriveGroupKey requires a group UUID');
  return sha256Hex(buildGroupKeyInput(groupUuid));
}

export type IdentityHasher = {
  deriveDistinctId: (userUuid: string) => Promise<string>;
  deriveGroupKey: (groupUuid: string) => Promise<string>;
};

export const defaultIdentityHasher: IdentityHasher = {
  deriveDistinctId,
  deriveGroupKey,
};
