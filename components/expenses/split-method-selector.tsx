import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ThemedText } from '@/components/themed-text';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { SPLIT_METHODS, SplitMethod, SplitType } from './expense-split-types';

export interface SplitMethodSelectorProps {
  splitMethod: SplitMethod;
  onSelectSplitMethod: (method: SplitMethod) => void;
  splitType?: SplitType;
  label?: string;
}

export function SplitMethodSelector({
  splitMethod,
  onSelectSplitMethod,
  splitType,
  label = 'Split method',
}: SplitMethodSelectorProps) {
  const { colors, settle, isDark } = useThemeColors();

  const availableMethods = SPLIT_METHODS.filter(method => {
    if (splitType === SplitType.FRIENDS && method.id === SplitMethod.SHARES) {
      return false;
    }
    return true;
  });

  return (
    <View style={styles.container}>
      <ThemedText style={[styles.label, { color: colors.textSecondary }]}>
        {label}
      </ThemedText>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled">
        {availableMethods.map(method => {
          const isActive = splitMethod === method.id;
          const compactLabel = method.id === SplitMethod.PERCENTAGE ? 'Percent' : method.label;
          return (
            <TouchableOpacity
              key={method.id}
              accessibilityRole="button"
              accessibilityLabel={`Split method ${method.label}`}
              accessibilityState={{ selected: isActive }}
              style={[
                styles.button,
                isActive && styles.buttonActive,
                {
                  backgroundColor: isActive ? settle.buttonBackground : settle.pillBackground,
                  borderColor: isActive ? settle.buttonBackground : colors.border,
                },
              ]}
              onPress={() => onSelectSplitMethod(method.id)}>
              <IconSymbol
                name={method.icon}
                size={18}
                color={isActive ? (isDark ? '#003824' : '#ffffff') : colors.text}
              />
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.82}
                style={[
                  styles.buttonText,
                  { color: isActive ? (isDark ? '#003824' : '#ffffff') : colors.text },
                ]}>
                {compactLabel}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  scrollContent: {
    gap: 8,
    paddingRight: 18,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    minHeight: 44,
    minWidth: 112,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  buttonActive: {
    borderWidth: 1.5,
  },
  buttonText: {
    flexShrink: 1,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
});
