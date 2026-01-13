import { ThemedText } from '@/components/themed-text';
import { IconSymbol, IconSymbolName } from '@/components/ui/icon-symbol';
import { useThemeColors } from '@/hooks/use-theme-colors';
import React from 'react';
import { StyleSheet, Switch, TouchableOpacity, View } from 'react-native';

interface SettingsItemProps {
  icon: IconSymbolName;
  label: string;
  onPress?: () => void;
  isSwitch?: boolean;
  switchValue?: boolean;
  onSwitchChange?: (value: boolean) => void;
}

export function SettingsItem({
  icon,
  label,
  onPress,
  isSwitch,
  switchValue,
  onSwitchChange,
}: SettingsItemProps) {
  const { colors, isDark } = useThemeColors();

  const content = (
    <View
      style={[
        styles.container,
        !isDark && { backgroundColor: colors.card, borderColor: colors.border },
      ]}>
      <View
        style={[
          styles.iconContainer,
          {
            backgroundColor: isDark
              ? 'rgba(45, 212, 191, 0.15)'
              : 'rgba(34, 197, 94, 0.1)',
          },
        ]}>
        <IconSymbol size={20} name={icon} color={isDark ? '#2DD4BF' : colors.tint} />
      </View>
      <ThemedText style={[styles.label, !isDark && { color: colors.text }]}>
        {label}
      </ThemedText>
      {isSwitch ? (
        <Switch
          value={switchValue}
          onValueChange={onSwitchChange}
          trackColor={{ false: '#3e3e3e', true: isDark ? '#2DD4BF' : colors.tint }}
          thumbColor={isDark ? '#fff' : colors.card}
        />
      ) : (
        <IconSymbol
          size={20}
          name="chevron.right"
          color={isDark ? 'rgba(255,255,255,0.3)' : colors.textSecondary}
        />
      )}
    </View>
  );

  if (isSwitch) {
    return content;
  }

  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress}>
      {content}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(20, 35, 38, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(45, 212, 191, 0.1)',
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  label: {
    flex: 1,
    fontSize: 15,
    color: '#fff',
  },
});
