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
            backgroundColor: isDark ? 'rgba(30, 41, 59, 0.6)' : 'rgba(241, 245, 249, 0.9)',
            borderColor: isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(34, 197, 94, 0.2)',
          },
        ]}>
        {icon && (
          <IconSymbol
            name={icon}
            size={iconSize}
            color={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'}
          />
        )}
        <TextInput
          ref={ref}
          style={[
            styles.input,
            {
              color: isDark ? '#fff' : colors.text,
              height: Platform.OS === 'android' ? 48 : 44,
            },
            style,
          ]}
          placeholderTextColor={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'}
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
    fontFamily: 'Nunito_400Regular',
    paddingVertical: 0,
  },
});
