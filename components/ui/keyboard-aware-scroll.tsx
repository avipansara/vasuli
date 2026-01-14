import { useThemeColors } from '@/hooks/use-theme-colors';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import {
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    View,
} from 'react-native';
import { ThemedText } from '../themed-text';
import { IconSymbol } from './icon-symbol';

interface KeyboardAwareScrollProps {
  children: React.ReactNode;
  contentContainerStyle?: any;
  showDismissButton?: boolean;
  footer?: React.ReactNode;
}

export function KeyboardAwareScroll({
  children,
  contentContainerStyle,
  showDismissButton = true,
  footer,
}: KeyboardAwareScrollProps) {
  const { colors, isDark } = useThemeColors();
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', () => {
      setKeyboardVisible(true);
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardVisible(false);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const dismissKeyboard = () => {
    Keyboard.dismiss();
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive">
        {children}
      </ScrollView>

      {/* Keyboard Dismiss Button - Shows when keyboard is visible (only on iOS or when Android keyboard doesn't have done button) */}
      {showDismissButton && keyboardVisible && Platform.OS === 'ios' && (
        <View style={styles.dismissButtonContainer}>
          <TouchableOpacity
            onPress={dismissKeyboard}
            style={[
              styles.dismissButton,
              {
                backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)',
                borderColor: isDark ? 'rgba(45, 212, 191, 0.3)' : 'rgba(34, 197, 94, 0.3)',
              },
            ]}>
            <IconSymbol name="keyboard.chevron.compact.down" size={20} color={isDark ? '#2DD4BF' : colors.tint} />
            <ThemedText style={[styles.dismissButtonText, !isDark && { color: colors.text }]}>
              Done
            </ThemedText>
          </TouchableOpacity>
        </View>
      )}

      {/* Footer - Always visible above keyboard */}
      {footer && !keyboardVisible && (
        <View style={styles.footerContainer}>
          <LinearGradient
            colors={isDark ? ['rgba(10, 10, 15, 0)', 'rgba(10, 10, 15, 0.95)', 'rgba(10, 10, 15, 1)'] : ['rgba(255, 255, 255, 0)', 'rgba(255, 255, 255, 0.95)', 'rgba(255, 255, 255, 1)']}
            style={styles.footerGradient}
          />
          {footer}
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 140,
  },
  dismissButtonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: 'transparent',
  },
  dismissButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
  },
  dismissButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  footerContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  footerGradient: {
    position: 'absolute',
    top: -40,
    left: 0,
    right: 0,
    height: 60,
  },
  footerWithKeyboard: {
    position: 'relative',
    paddingBottom: 20,
  },
});
