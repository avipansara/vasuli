import { ThemedText } from '@/components/themed-text';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { formatCurrency } from '@/utils/currency';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

export type SettlementReceiptProps = {
  amount: number;
  currency: string;
  friendName: string;
  paidByYou: boolean;
  remainingAmount: number;
  reused?: boolean;
  scopeName?: string;
};

export function SettlementReceipt({ amount, currency, friendName, paidByYou, remainingAmount, scopeName, reused = false }: SettlementReceiptProps) {
  const { settle } = useThemeColors();
  const reducedMotion = useReducedMotion();
  const stamp = useSharedValue(reducedMotion || reused ? 1 : 0);
  const paper = useSharedValue(reducedMotion || reused ? 1 : 0);
  const impact = useSharedValue(0);
  const didHaptic = useRef(false);
  const landed = useCallback(() => {
    if (reused || didHaptic.current) return;
    didHaptic.current = true;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {
      // Visual confirmation remains sufficient when haptics are unavailable.
    });
  }, [reused]);

  useEffect(() => {
    const easeOut = Easing.bezier(0.23, 1, 0.32, 1);
    if (reducedMotion || reused) {
      paper.set(1);
      stamp.set(1);
      landed();
    } else {
      paper.set(withTiming(1, { duration: 280, easing: easeOut }));
      stamp.set(withDelay(240, withTiming(1, {
        duration: 160,
        easing: Easing.bezier(0.77, 0, 0.175, 1),
      }, finished => {
        if (finished) scheduleOnRN(landed);
      })));
      impact.set(withDelay(400, withSequence(
        withTiming(1, { duration: 60, easing: easeOut }),
        withTiming(0, { duration: 170, easing: easeOut }),
      )));
    }
    return () => {
      cancelAnimation(stamp);
      cancelAnimation(paper);
      cancelAnimation(impact);
    };
  }, [reducedMotion, reused, stamp, paper, impact, landed]);

  const paperStyle = useAnimatedStyle(() => ({
    opacity: paper.get(),
    transform: [
      { translateY: reducedMotion ? 0 : 18 * (1 - paper.get()) + 2 * impact.get() },
      { scale: reducedMotion ? 1 : 0.97 + 0.03 * paper.get() - 0.008 * impact.get() },
    ],
  }));
  const stampStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, stamp.get() * 3),
    transform: [
      { translateY: reducedMotion ? 0 : -26 * (1 - stamp.get()) },
      { scale: reducedMotion ? 1 : 1 + 0.28 * (1 - stamp.get()) },
      { rotate: `${-7 - (reducedMotion ? 0 : 9 * (1 - stamp.get()))}deg` },
    ],
  }));

  return (
    <Animated.View testID="settlement-receipt" style={[styles.paper, { backgroundColor: settle.receiptPaper, shadowColor: settle.receiptShadow }, paperStyle]}>
      <ThemedText style={[styles.title, { color: settle.textPrimary }]}>Settlement receipt</ThemedText>
      <View style={[styles.rule, { borderColor: settle.cardBorder }]} />
      <ThemedText style={[styles.direction, { color: settle.textSecondary }]}>{paidByYou ? `You paid ${friendName}` : `${friendName} paid you`}</ThemedText>
      <ThemedText testID="settlement-receipt-amount" style={[styles.amount, { color: settle.textPrimary }]}>{formatCurrency(amount, currency)}</ThemedText>
      <View style={styles.stampSpace}>
        <Animated.View testID="settlement-receipt-stamp" style={[styles.stamp, { borderColor: settle.accentText }, stampStyle]}>
          <View style={[styles.stampInner, { borderColor: settle.accentText }]}>
            <ThemedText style={[styles.stampText, { color: settle.accentText }]}>SETTLED</ThemedText>
          </View>
        </Animated.View>
      </View>
      <View style={[styles.rule, { borderColor: settle.cardBorder }]} />
      <ThemedText testID="settlement-receipt-status" accessibilityLiveRegion="polite" style={[styles.status, { color: settle.textSecondary }]}>
        {reused ? 'This settlement was already recorded.' : remainingAmount > 0.005 ? `${formatCurrency(remainingAmount, currency)} remaining with ${friendName}${scopeName ? ` in ${scopeName}` : ''}.` : `You're all square with ${friendName}${scopeName ? ` in ${scopeName}` : ''}.`}
      </ThemedText>
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.tornEdge}>
        {Array.from({ length: 16 }, (_, index) => <View key={index} style={[styles.tooth, { borderTopColor: settle.receiptPaper }]} />)}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  paper: { borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 28, marginBottom: 32, width: '100%', maxWidth: 380, alignSelf: 'center', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 4 },
  title: { fontSize: 15, fontFamily: 'Manrope_700Bold', textAlign: 'center', marginBottom: 24 },
  rule: { borderTopWidth: 1, borderStyle: 'dashed', width: '100%' },
  direction: { fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 28 },
  amount: { fontSize: 44, lineHeight: 58, fontFamily: 'Manrope_800ExtraBold', textAlign: 'center', marginTop: 10, fontVariant: ['tabular-nums'], letterSpacing: -1 },
  stampSpace: { alignItems: 'center', paddingVertical: 32 },
  stamp: { borderWidth: 2, borderRadius: 8, padding: 4 },
  stampInner: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 22, paddingVertical: 8 },
  stampText: { fontSize: 24, lineHeight: 32, fontFamily: 'Manrope_800ExtraBold', letterSpacing: 3 },
  status: { fontSize: 14, lineHeight: 22, textAlign: 'center', marginTop: 22, marginBottom: 6 },
  tornEdge: { position: 'absolute', bottom: -8, left: 0, right: 0, flexDirection: 'row' },
  tooth: { flex: 1, height: 0, borderTopWidth: 8, borderLeftWidth: 8, borderRightWidth: 8, borderLeftColor: 'transparent', borderRightColor: 'transparent' },
});
