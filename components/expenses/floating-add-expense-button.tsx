import { IconSymbol } from '@/components/ui/icon-symbol';
import { ThemedText } from '@/components/themed-text';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Gradients } from '@/constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { router, usePathname } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface FloatingAddExpenseButtonProps {
  bottomOffset?: number;
  rightOffset?: number;
}

export function FloatingAddExpenseButton({
  bottomOffset = 74,
  rightOffset = 18,
}: FloatingAddExpenseButtonProps) {
  const { isDark } = useThemeColors();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const bottom = Math.max(insets.bottom, 12) + bottomOffset;
  const right = Math.max(insets.right, 0) + rightOffset;

  if (pathname === '/profile' || pathname.startsWith('/friends/')) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={[styles.container, { bottom, right }]}>
      <Pressable
        accessibilityLabel="Add expense"
        accessibilityRole="button"
        onPress={() => router.push('/add-expense')}
        style={({ pressed }) => [
          styles.button,
          isDark ? styles.darkShadow : styles.lightShadow,
          pressed && styles.pressed,
        ]}>
        <LinearGradient
          colors={Gradients.light.buttonPrimary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradient}>
          <IconSymbol name="doc.text.fill" size={16} color="#fff" />
          <ThemedText style={styles.buttonText} type="defaultSemiBold">
            Add Expense
          </ThemedText>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: 20,
  },
  button: {
    borderRadius: 22,
    height: 44,
    overflow: 'hidden',
  },
  gradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    paddingHorizontal: 16,
    gap: 8,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  darkShadow: {
    elevation: 6,
    shadowColor: '#2DD4BF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
  },
  lightShadow: {
    elevation: 6,
    shadowColor: '#166534',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
  },
  pressed: {
    opacity: 0.86,
    transform: [{ scale: 0.97 }],
  },
});
