import { ACCENT_GREEN, ACCENT_TEAL } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { ThemedText } from '../themed-text';

interface SelectableOptionProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

export function SelectableOption({ label, selected, onPress }: SelectableOptionProps) {
  const { colors, isDark } = useThemeColors();

  const unselectedStyle = isDark
    ? styles.unselectedDark
    : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 };

  const textColor = selected
    ? '#0A0A0F'
    : isDark
    ? '#f4f4f5'
    : colors.text;

  if (selected) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
        <LinearGradient
          colors={isDark ? [ACCENT_TEAL, '#14B8A6'] : [ACCENT_GREEN, '#16A34A']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.option}>
          <ThemedText style={[styles.optionText, { color: textColor }]}>
            {label}
          </ThemedText>
          <IconSymbol name="checkmark" size={16} color={textColor} />
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.option, unselectedStyle]}
      onPress={onPress}
      activeOpacity={0.7}>
      <ThemedText style={[styles.optionText, { color: textColor }]}>
        {label}
      </ThemedText>
    </TouchableOpacity>
  );
}

interface SelectableOptionListProps {
  children: React.ReactNode;
}

export function SelectableOptionList({ children }: SelectableOptionListProps) {
  return <View style={styles.list}>{children}</View>;
}

const styles = StyleSheet.create({
  list: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  unselectedDark: {
    backgroundColor: 'rgba(26, 26, 36, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(45, 212, 191, 0.2)',
  },
  optionText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
