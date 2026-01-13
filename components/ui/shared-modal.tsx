import {
  ACCENT_TEAL,
  BG_ICON_DARK,
  BG_ICON_LIGHT,
  BTN_CLOSE_LIGHT,
  BTN_DISABLED_DARK,
  BTN_DISABLED_LIGHT,
} from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View
} from 'react-native';
import { ThemedText } from '../themed-text';
import { IconSymbol, IconSymbolName } from './icon-symbol';

interface SharedModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  icon: IconSymbolName;
  iconBackgroundColor?: string;
  iconColor?: string;
  children: React.ReactNode;
  footerContent?: React.ReactNode;
  submitLabel?: string;
  submitIcon?: IconSymbolName;
  submitDisabled?: boolean;
  onSubmit?: () => void;
  submitGradientColors?: readonly [string, string];
  submitTextColor?: string;
}

export function SharedModal({
  visible,
  onClose,
  title,
  subtitle,
  icon,
  iconBackgroundColor,
  iconColor,
  children,
  footerContent,
  submitLabel,
  submitIcon = 'plus.circle.fill',
  submitDisabled = false,
  onSubmit,
  submitGradientColors,
  submitTextColor = '#0A0A0F',
}: SharedModalProps) {
  const { colors, gradients, isDark } = useThemeColors();

  const defaultIconBg = isDark ? BG_ICON_DARK : BG_ICON_LIGHT;
  const defaultIconColor = isDark ? ACCENT_TEAL : colors.tint;
  const closeBtnBg = isDark ? undefined : { backgroundColor: BTN_CLOSE_LIGHT };
  const closeIconColor = isDark ? '#fff' : colors.text;

  const disabledColors = isDark ? BTN_DISABLED_DARK : BTN_DISABLED_LIGHT;
  const buttonColors = submitDisabled
    ? disabledColors
    : (submitGradientColors || gradients.buttonPrimary);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}>
      <LinearGradient colors={gradients.screenBackground} style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboard}>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeButton, closeBtnBg]}>
              <IconSymbol size={20} name="xmark" color={closeIconColor} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled">
            <View style={styles.headerContent}>
              <View
                style={[
                  styles.iconContainer,
                  { backgroundColor: iconBackgroundColor || defaultIconBg },
                ]}>
                <IconSymbol
                  size={40}
                  name={icon}
                  color={iconColor || defaultIconColor}
                />
              </View>
              <View>
                <ThemedText
                  type="title"
                  style={[styles.title, !isDark && { color: colors.text }]}>
                  {title}
                </ThemedText>
                <ThemedText
                  style={[
                    styles.subtitle,
                    !isDark && { color: colors.textSecondary },
                  ]}>
                  {subtitle}
                </ThemedText>
              </View>
            </View>

            {children}
          </ScrollView>

          {(onSubmit || footerContent) && (
            <View
              style={[
                styles.footer,
                { borderTopColor: isDark ? 'rgba(45, 212, 191, 0.15)' : colors.border },
              ]}>
              {footerContent || (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={onSubmit}
                  disabled={submitDisabled}>
                  <LinearGradient
                    colors={buttonColors as [string, string]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[
                      styles.submitButton,
                      submitDisabled && styles.disabledButton,
                    ]}>
                    <IconSymbol
                      size={20}
                      name={submitIcon}
                      color={submitDisabled ? '#6B7280' : submitTextColor}
                    />
                    <ThemedText
                      style={[
                        styles.submitButtonText,
                        { color: submitDisabled ? '#6B7280' : submitTextColor },
                      ]}>
                      {submitLabel}
                    </ThemedText>
                  </LinearGradient>
                </TouchableOpacity>
              )}
            </View>
          )}
        </KeyboardAvoidingView>
      </LinearGradient>
    </Modal>
  );
}

// Shared form components for use inside modals
interface FormGroupProps {
  label: string;
  children: React.ReactNode;
}

export function FormGroup({ label, children }: FormGroupProps) {
  const { colors, isDark } = useThemeColors();

  return (
    <View style={styles.formGroup}>
      <ThemedText
        style={[styles.label, !isDark && { color: colors.textSecondary }]}>
        {label}
      </ThemedText>
      {children}
    </View>
  );
}

interface PrivacyNoteProps {
  children: string;
}

export function PrivacyNote({ children }: PrivacyNoteProps) {
  const { colors, isDark } = useThemeColors();

  return (
    <ThemedText
      style={[styles.privacyNote, !isDark && { color: colors.textSecondary }]}>
      {children}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboard: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 8,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  headerContent: {
    alignItems: 'center',
    marginBottom: 32,
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    opacity: 0.7,
    textAlign: 'center',
    lineHeight: 22,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    opacity: 0.7,
  },
  privacyNote: {
    fontSize: 12,
    opacity: 0.5,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
  },
  footer: {
    padding: 20,
    paddingBottom: 36,
    borderTopWidth: 1,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    gap: 8,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.6,
  },
});
