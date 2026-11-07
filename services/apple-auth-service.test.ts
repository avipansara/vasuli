import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { signInWithApple } from './apple-auth-service';

const mocks = vi.hoisted(() => ({
  available: vi.fn(), signIn: vi.fn(), verify: vi.fn(), update: vi.fn(),
  link: vi.fn(), mark: vi.fn(),
}));
vi.mock('expo-apple-authentication', () => ({
  isAvailableAsync: mocks.available,
  signInAsync: mocks.signIn,
  formatFullName: (name: { givenName: string; familyName: string }) => `${name.givenName} ${name.familyName}`,
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));
vi.mock('expo-crypto', () => ({
  randomUUID: () => 'test-random-nonce',
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async (_algorithm: string, value: string) => createHash('sha256').update(value).digest('hex'),
}));
vi.mock('@/lib/supabase', () => ({ supabase: { auth: {
  signInWithIdToken: mocks.verify, updateUser: mocks.update,
} } }));
vi.mock('@/services/auth-profile-service', () => ({ linkAuthUserToProfile: mocks.link }));
vi.mock('@/lib/analytics/account-created-flag', () => ({ markAccountCreated: mocks.mark }));

describe('native Apple authentication', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.available.mockResolvedValue(true);
    mocks.signIn.mockResolvedValue({ identityToken: 'apple-token', email: null, fullName: null });
    mocks.verify.mockResolvedValue({ data: {
      user: { id: 'auth-id', email: 'private@privaterelay.appleid.com', user_metadata: {} },
      session: { access_token: 'session-token' },
    }, error: null });
    mocks.link.mockResolvedValue({ user: { id: 'profile-id' }, created: false });
    mocks.update.mockResolvedValue({ error: null });
  });

  it('binds the Apple token to the original nonce and accepts a verified relay email on repeat login', async () => {
    expect(await signInWithApple()).toEqual({ success: true });
    const appleNonce = mocks.signIn.mock.calls[0][0].nonce;
    const verifiedNonce = mocks.verify.mock.calls[0][0].nonce;
    expect(appleNonce).toBe(createHash('sha256').update(verifiedNonce).digest('hex'));
    expect(appleNonce).not.toBe(verifiedNonce);
    expect(mocks.verify).toHaveBeenCalledWith({ provider: 'apple', token: 'apple-token', nonce: verifiedNonce });
    expect(mocks.link).toHaveBeenCalledWith({
      authUserId: 'auth-id', email: 'private@privaterelay.appleid.com', name: 'Vasuli user',
    });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.mark).not.toHaveBeenCalled();
  });

  it('saves the first-authorization name and records creation only for a new profile', async () => {
    mocks.signIn.mockResolvedValue({ identityToken: 'apple-token', fullName: { givenName: 'Alex', familyName: 'Taylor' } });
    mocks.link.mockResolvedValue({ user: { id: 'new-profile' }, created: true });
    expect(await signInWithApple()).toEqual({ success: true });
    expect(mocks.link.mock.calls[0][0].name).toBe('Alex Taylor');
    expect(mocks.update).toHaveBeenCalledWith({ data: { name: 'Alex Taylor' } });
    expect(mocks.mark).toHaveBeenCalledWith('new-profile');
  });

  it('preserves the saved auth name when Apple no longer supplies it', async () => {
    mocks.verify.mockResolvedValue({ data: {
      user: { id: 'auth-id', email: 'private@privaterelay.appleid.com', user_metadata: { name: 'Alex Taylor' } },
      session: {},
    }, error: null });
    expect(await signInWithApple()).toEqual({ success: true });
    expect(mocks.link.mock.calls[0][0].name).toBe('Alex Taylor');
  });

  it('links by authUserId when email is omitted from repeat Apple login', async () => {
    mocks.verify.mockResolvedValue({ data: {
      user: { id: 'auth-id', email: undefined, user_metadata: { full_name: 'Alex Taylor' } },
      session: {},
    }, error: null });
    expect(await signInWithApple()).toEqual({ success: true });
    expect(mocks.link).toHaveBeenCalledWith({
      authUserId: 'auth-id',
      email: undefined,
      name: 'Alex Taylor',
      allowMissingEmail: true,
    });
  });

  it('treats dismissal as cancellation without authenticating or creating a profile', async () => {
    mocks.signIn.mockRejectedValue({ code: 'ERR_REQUEST_CANCELED' });
    expect(await signInWithApple()).toEqual({ success: false, cancelled: true });
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.link).not.toHaveBeenCalled();
  });

  it('does not create a profile when Supabase rejects the token', async () => {
    mocks.verify.mockResolvedValue({ data: { user: null, session: null }, error: { message: 'Invalid nonce' } });
    expect(await signInWithApple()).toEqual({ success: false, error: 'Invalid nonce' });
    expect(mocks.link).not.toHaveBeenCalled();
  });

  it('rejects an incomplete Apple credential before calling Supabase', async () => {
    mocks.signIn.mockResolvedValue({ identityToken: null });
    expect((await signInWithApple()).success).toBe(false);
    expect(mocks.verify).not.toHaveBeenCalled();
  });

  it('does not start authorization on an unsupported device', async () => {
    mocks.available.mockResolvedValue(false);
    expect((await signInWithApple()).success).toBe(false);
    expect(mocks.signIn).not.toHaveBeenCalled();
  });
});
