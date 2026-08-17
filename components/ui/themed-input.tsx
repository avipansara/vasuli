import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { forwardRef } from 'react';
import { Platform, StyleSheet, TextInput, TextInputProps, View } from 'react-native';

interface ThemedInputProps extends TextInputProps {
  icon?: any;
  iconSize?: number;
}

export const ThemedInput = forwardRef<TextInput, ThemedInputProps>(
  ({ icon, iconSize = 20, style, ...props }, ref) => {
    const { colors, isDark } = useThemeColors();

    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: isDark ? 'rgba(20, 35, 38, 0.95)' : '#ffffff',
            borderWidth: 1,
            borderColor: isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(0, 0, 0, 0.08)',
            shadowColor: isDark ? '#000000' : '#475569',
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: isDark ? 0.35 : 0.09,
            shadowRadius: 10,
            elevation: 3,
          },
        ]}>
        {icon && (
          <IconSymbol
            name={icon}
            size={iconSize}
            color={isDark ? '#2DD4BF' : '#0F4C3A'}
          />
        )}
        <TextInput
          ref={ref}
          style={[
            styles.input,
            {
              color: colors.text,
              minHeight: Platform.OS === 'android' ? 48 : 44,
            },
            style,
          ]}
          placeholderTextColor={colors.textSecondary}
          {...props}
        />
      </View>
    );
  }
);

ThemedInput.displayName = 'ThemedInput';

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Manrope_400Regular',
    paddingVertical: 0,
    textAlignVertical: 'center',
  },
});
