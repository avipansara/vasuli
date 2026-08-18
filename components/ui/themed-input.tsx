import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { forwardRef } from 'react';
import { Platform, StyleSheet, TextInput, TextInputProps, View, ViewStyle } from 'react-native';

interface ThemedInputProps extends TextInputProps {
  icon?: any;
  iconSize?: number;
  trailing?: React.ReactNode;
  containerStyle?: ViewStyle;
}

export const ThemedInput = forwardRef<TextInput, ThemedInputProps>(
  ({ icon, iconSize = 20, trailing, containerStyle, style, ...props }, ref) => {
    const { colors, isDark } = useThemeColors();

    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: isDark ? (colors.inputBackground || '#0b1120') : '#ffffff',
            borderWidth: 1,
            borderColor: isDark ? (colors.inputBorder || '#2a3441') : '#dce2f7',
            shadowColor: isDark ? '#000000' : '#475569',
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: isDark ? 0.35 : 0.09,
            shadowRadius: 10,
            elevation: 3,
          },
          containerStyle,
        ]}>
        {icon && (
          <IconSymbol
            name={icon}
            size={iconSize}
            color={isDark ? '#10b981' : colors.tint}
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
        {trailing}
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
