import { StyleSheet, Text, type TextProps } from 'react-native';

import { useThemeColor } from '@/hooks/use-theme-color';

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: 'default' | 'title' | 'defaultSemiBold' | 'subtitle' | 'link' | 'header';
};

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = 'default',
  ...rest
}: ThemedTextProps) {
  const color = useThemeColor({ light: lightColor, dark: darkColor }, 'text');
  const tintColor = useThemeColor({}, 'tint');

  return (
    <Text
      style={[
        styles.base,
        { color },
        type === 'default' ? styles.default : undefined,
        type === 'title' ? styles.title : undefined,
        type === 'defaultSemiBold' ? styles.defaultSemiBold : undefined,
        type === 'subtitle' ? styles.subtitle : undefined,
        type === 'link' ? [styles.link, { color: tintColor }] : undefined,
        type === 'header' ? styles.header : undefined,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    fontFamily: 'Nunito_400Regular',
  },
  default: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Nunito_400Regular',
  },
  defaultSemiBold: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Nunito_600SemiBold',
  },
  header: {
    fontSize: 30,
    fontFamily: 'Nunito_700Bold',
    lineHeight: 36,
    letterSpacing: -0.5,
  },
  title: {
    fontSize: 24,
    fontFamily: 'Nunito_700Bold',
    lineHeight: 28,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: 'Nunito_600SemiBold',
  },
  link: {
    lineHeight: 24,
    fontSize: 14,
    fontFamily: 'Nunito_500Medium',
  },
});
