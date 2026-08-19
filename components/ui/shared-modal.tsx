import {
  ACCENT_TEAL,
  BG_ICON_DARK,
  BG_ICON_LIGHT
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
import { ThemedButton } from './themed-button';

interface SharedModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  icon: IconSymbolName;
  iconBackgroundColor?: string;
  iconColor?: string;
  children?: React.ReactNode;
  bodyContent?: React.ReactNode;
  footerContent?: React.ReactNode;
  submitLabel?: string;
  submitIcon?: IconSymbolName;
  submitDisabled?: boolean;
  submitLoading?: boolean;
  submitTextColor?: string;
  headerStyle?: 'default' | 'centered';
  submitBadge?: string | number;
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
  bodyContent,
  footerContent,
  submitLabel,
  submitIcon = 'plus.circle.fill',
  submitDisabled = false,
  submitLoading = false,
  onSubmit,
  submitTextColor = '#0A0A0F',
  headerStyle = 'default',
  submitBadge,
}: SharedModalProps) {
  const { colors, gradients, isDark } = useThemeColors();

  const defaultIconBg = isDark ? BG_ICON_DARK : BG_ICON_LIGHT;
  const defaultIconColor = isDark ? ACCENT_TEAL : colors.tint;
  const closeIconColor = '#EF4444';

  const headerContent = (
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
            { color: colors.textSecondary },
          ]}>
          {subtitle}
        </ThemedText>
      </View>
    </View>
  );

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
          {headerStyle === 'centered' ? (
            <View style={[styles.centeredHeader, { borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]}>
              <TouchableOpacity
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close modal"
                style={styles.centeredCloseButton}>
                <IconSymbol size={20} name="xmark" color={colors.text} />
              </TouchableOpacity>
              <ThemedText style={[styles.centeredTitle, { color: colors.text }]}>
                {title}
              </ThemedText>
              <View style={{ width: 36 }} />
            </View>
          ) : (
            <View style={styles.header}>
              <TouchableOpacity
                onPress={onClose}
                style={styles.closeButton}>
                <IconSymbol size={20} name="xmark" color={closeIconColor} />
              </TouchableOpacity>
            </View>
          )}

          {bodyContent ? (
            <View style={styles.bodyContent}>
              {headerStyle !== 'centered' && headerContent}
              {bodyContent}
            </View>
          ) : (
            <ScrollView
              style={styles.scrollView}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled">
              {headerStyle !== 'centered' && headerContent}
              {children}
            </ScrollView>
          )}

          {(onSubmit || footerContent) && (
            <View
              style={[
                styles.footer,
                { borderTopColor: isDark ? 'rgba(45, 212, 191, 0.15)' : colors.border },
              ]}>
              {footerContent || (
                <ThemedButton
                  label={submitLabel || ''}
                  onPress={onSubmit || (() => {})}
                  disabled={submitDisabled}
                  loading={submitLoading}
                  icon={submitIcon}
                  badge={submitBadge}
                />
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
  const { colors } = useThemeColors();

  return (
    <View style={styles.formGroup}>
      <ThemedText
        style={[styles.label, { color: colors.textSecondary }]}>
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
  const { colors } = useThemeColors();

  return (
    <ThemedText
      style={[styles.privacyNote, { color: colors.textSecondary }]}>
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
    borderRadius: 10,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  scrollView: {
    flex: 1,
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
    textAlign: 'center',
    lineHeight: 22,
  },
  formGroup: {
    marginBottom: 20,
  },
  bodyContent: {
    flex: 1,
    paddingHorizontal: 24,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  privacyNote: {
    fontSize: 12,
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
  centeredHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 24,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  centeredCloseButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centeredTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  submitBadgeContainer: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    marginLeft: 6,
  },
  submitBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
