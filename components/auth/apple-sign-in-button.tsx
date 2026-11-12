export type AppleSignInButtonProps = {
  onPress: () => void;
  disabled: boolean;
  testID: string;
};

// Native Sign in with Apple is offered on iOS. Other platforms keep their
// existing Google and email login options.
export function AppleSignInButton(_props: AppleSignInButtonProps) {
  return null;
}
