import { supabase } from '@/lib/supabase';
import { markAccountCreated } from '@/lib/analytics/account-created-flag';
import { linkAuthUserToProfile } from '@/services/auth-profile-service';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';

type AppleSignInResult =
  | { success: true }
  | { success: false; cancelled: true }
  | { success: false; cancelled?: false; error: string };

export async function signInWithApple(): Promise<AppleSignInResult> {
  try {
    if (!(await AppleAuthentication.isAvailableAsync())) {
      return { success: false, error: 'Apple sign-in is unavailable on this device.' };
    }

    // Apple receives the hash; Supabase verifies it against the original nonce.
    const nonce = Crypto.randomUUID();
    const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
    if (!credential.identityToken) {
      return { success: false, error: 'Apple did not return an identity token. Please try again.' };
    }

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
      nonce,
    });
    if (error || !data.user || !data.session) {
      return { success: false, error: error?.message || 'Unable to establish your Apple session.' };
    }

    // Use the email verified by Supabase (including Apple's @privaterelay.appleid.com
    // address when the user selects Hide My Email), falling back to credential.email
    // or auth_user_id lookup if Apple omits the email claim on repeat login.
    const name = credential.fullName
      ? AppleAuthentication.formatFullName(credential.fullName).trim()
      : '';
    const storedName = data.user.user_metadata?.name ?? data.user.user_metadata?.full_name;
    const verifiedEmail = data.user.email || credential.email || undefined;
    const { user, created } = await linkAuthUserToProfile({
      authUserId: data.user.id,
      email: verifiedEmail,
      name: name || (typeof storedName === 'string' && storedName.trim()) || 'Vasuli user',
      ...(verifiedEmail ? {} : { allowMissingEmail: true }),
    });
    if (created) await markAccountCreated(user.id);

    if (name) {
      const { error: metadataError } = await supabase.auth.updateUser({ data: { name } });
      if (metadataError) {
        // The application profile already stores the name; don't block login.
        console.error('Failed to save Apple name to auth metadata:', metadataError.message);
      }
    }
    return { success: true };
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ERR_REQUEST_CANCELED') {
      return { success: false, cancelled: true };
    }
    console.error('Apple sign-in failed:', error instanceof Error ? error.message : 'Unknown error');
    return { success: false, error: error instanceof Error ? error.message : 'Apple sign-in failed. Please try again.' };
  }
}
