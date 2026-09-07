import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { StyleSheet, TouchableOpacity } from 'react-native';
import Reanimated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

export function SettlementOperationDeleteSwipeAction({
  translation, backgroundColor, iconColor, onPress, accessibilityLabel, accessibilityHint, disabled, testID,
}: {
  translation: SharedValue<number>;
  backgroundColor: string;
  iconColor: string;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint: string;
  disabled: boolean;
  testID: string;
}) {
  const actionStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, -translation.get() / 80)) }));
  return (
    <Reanimated.View style={[styles.swipeActionRight, { backgroundColor }, actionStyle]}>
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled }}
        testID={testID}
        style={styles.swipeActionButton}>
        <IconSymbol name="trash" size={20} color={iconColor} />
        <ThemedText style={[styles.swipeActionText, { color: iconColor }]}>Delete</ThemedText>
      </TouchableOpacity>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  swipeActionRight: { flex: 1, alignItems: 'flex-end', justifyContent: 'center', borderRadius: 12 },
  swipeActionButton: { width: 80, alignItems: 'center', justifyContent: 'center', minHeight: 64 },
  swipeActionText: { fontSize: 12, marginTop: 4 },
});
