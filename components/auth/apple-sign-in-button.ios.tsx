import { useThemeColors } from '@/hooks/use-theme-colors';
// eslint-disable-next-line import/no-unresolved
import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import type { AppleSignInButtonProps } from './apple-sign-in-button';

export function AppleSignInButton({ onPress, disabled, testID }: AppleSignInButtonProps) {
  const { isDark } = useThemeColors();
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let mounted = true;
    AppleAuthentication.isAvailableAsync()
      .then(value => { if (mounted) setAvailable(value); })
      .catch(error => console.error('Unable to check Apple sign-in availability:', error));
    return () => { mounted = false; };
  }, []);

  if (!available) return null;

  return (
    <View
      pointerEvents={disabled ? 'none' : 'auto'}
      accessibilityState={{ disabled, busy: disabled }}
      style={{ marginBottom: 12, opacity: disabled ? 0.5 : 1 }}
    >
      <AppleAuthentication.AppleAuthenticationButton
        testID={testID}
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
        buttonStyle={isDark
          ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
          : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
        cornerRadius={12}
        style={{ width: '100%', height: 50 }}
        accessibilityState={{ disabled, busy: disabled }}
        onPress={() => { if (!disabled) onPress(); }}
      />
    </View>
  );
}
