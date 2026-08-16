import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColors } from '@/hooks/use-theme-colors';
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
  const { gradients, isDark } = useThemeColors();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const bottom = Math.max(insets.bottom, 12) + bottomOffset;
  const right = Math.max(insets.right, 0) + rightOffset;

  if (pathname === '/profile' || pathname.startsWith('/friends/') || pathname.startsWith('/groups/')) {
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
          colors={gradients.buttonPrimary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradient}>
          <IconSymbol name="doc.text.fill" size={25} color="#fff" />
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
    borderRadius: 27,
    height: 54,
    overflow: 'hidden',
    width: 54,
  },
  gradient: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
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
