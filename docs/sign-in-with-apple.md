# Sign in with Apple setup

Vasuli uses native Apple authentication on iOS and exchanges the identity token
with Supabase. Google and email login remain available. Android and web retain
their existing login options. No Apple private key belongs in the app bundle.

## Account configuration

1. In Apple Developer, enable Sign in with Apple for the App ID
   `com.avipansara.vasuli`. Enable it for `com.avipansara.vasuli.dev` and
   `com.avipansara.vasuli.preview` when testing those builds too. Confirm that
   the provisioning profiles used to sign the builds include the capability.
2. In each relevant Supabase project, open Authentication > Sign In / Providers
   > Apple, enable the provider, and include the corresponding bundle IDs in
   its allowed Client IDs. Keep nonce verification enabled. Native identity-token
   authentication does not require a web Services ID or a rotating OAuth secret.
   If web Apple OAuth is added later, it requires separate configuration.
3. If sending account emails to Apple relay addresses, register the actual
   sending domain/address under Apple's Sign in with Apple email communication
   settings and configure the required email authentication for that sender.
4. Rebuild the development client before device testing. The Expo configuration
   enables `usesAppleSignIn` and the Apple authentication plugin. Existing native
   checkouts need regeneration and Pods installation before local builds. EAS
   builds generate native configuration from the app config. Publish a new iOS
   binary for App Review; this cannot be delivered solely through an OTA update.

## Verification before submission

- On `/sign-in-otp` and `/sign-up-otp`, check the native Continue with Apple
  button in light and dark appearance, including its disabled state during login.
- On a physical iPhone signed into an Apple Account, test both Share My Email
  and Hide My Email. Verify profile creation and navigation into the app.
- Sign out and sign in again. Apple may omit the name/email from the native
  response; Supabase's verified account email and the saved profile are used.
- Cancel Apple's sheet and verify the screen remains usable without an error.
- Test an offline failure and a retry, plus redirecting into a pending invite.
- Verify existing Google login, email OTP, and sign-out still work.
- A hidden-email Apple account may be separate from an existing account using
  a real email. The app does not merge identities based on an unverified address.
  Use the original login method to access an existing account.

Real provider verification is pending until the account configuration and a
signed device build are available. Automated tests cover nonce binding, relay
email profile linking, first-login name capture, repeat login, cancellation,
unsupported devices, and rejected/incomplete credentials.

References:

- [Expo Apple Authentication](https://docs.expo.dev/versions/latest/sdk/apple-authentication/)
- [Supabase Apple authentication](https://supabase.com/docs/guides/auth/social-login/auth-apple)
