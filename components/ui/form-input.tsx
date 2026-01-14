import { useThemeColors } from '@/hooks/use-theme-colors';
import React from 'react';
import { StyleSheet, TextInput, TextInputProps } from 'react-native';

interface FormInputProps extends TextInputProps {
  isDark?: boolean;
}

export function FormInput({ style, ...props }: FormInputProps) {
  const { colors, isDark } = useThemeColors();

  const lightModeStyles = !isDark
    ? {
        backgroundColor: colors.inputBackground,
        borderColor: colors.inputBorder,
        color: colors.text,
      }
    : undefined;

  return (
    <TextInput
      style={[styles.input, styles.glassInput, lightModeStyles, style]}
      placeholderTextColor="#6B7280"
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    height: 52,
    borderRadius: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    fontFamily: 'Nunito_400Regular',
    color: '#f4f4f5',
    textAlign: 'left',
    textAlignVertical: 'center',
  },
  glassInput: {
    backgroundColor: 'rgba(26, 26, 36, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(45, 212, 191, 0.2)',
  },
});
