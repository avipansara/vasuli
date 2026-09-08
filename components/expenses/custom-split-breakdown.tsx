import React from 'react';
import { StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { UserAvatar } from '@/components/ui/user-avatar';
import { ThemedText } from '@/components/themed-text';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { formatCurrency, getCurrencySymbol } from '@/utils/currency';
import { normalizeCurrencyInput } from '@/utils/validation';
import type { SplitProgress } from '@/utils/split-validation';
import { ExpenseParticipant, SplitMethod } from './expense-split-types';

export interface CustomSplitBreakdownProps {
  splitMethod: SplitMethod;
  totalAmount: number;
  currency?: string;
  participants: ExpenseParticipant[];
  customAmounts: Record<string, string>;
  customPercentages: Record<string, string>;
  customShares: Record<string, string>;
  onChangeCustomAmount: (userId: string, value: string) => void;
  onChangeCustomPercentage: (userId: string, value: string) => void;
  onChangeCustomShare: (userId: string, value: string) => void;
  splitProgress: SplitProgress;
  onSetEvenSplit?: () => void;
  readyLabel?: string;
}

export function CustomSplitBreakdown({
  splitMethod,
  totalAmount,
  currency,
  participants,
  customAmounts,
  customPercentages,
  customShares,
  onChangeCustomAmount,
  onChangeCustomPercentage,
  onChangeCustomShare,
  splitProgress,
  onSetEvenSplit,
  readyLabel = 'Ready to add',
}: CustomSplitBreakdownProps) {
  const { colors, isDark } = useThemeColors();

  const isBalanced = splitProgress.isBalanced;
  const remaining = splitProgress.remaining;

  const headerTitle =
    splitMethod === SplitMethod.UNEQUAL
      ? 'Enter amounts'
      : splitMethod === SplitMethod.PERCENTAGE
        ? 'Enter percentages'
        : 'Enter shares';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <ThemedText style={[styles.headerTitle, { color: colors.textSecondary }]}>
          {headerTitle}
        </ThemedText>
        {splitMethod === SplitMethod.UNEQUAL && (
          <View
            style={[
              styles.remainingBadge,
              {
                backgroundColor: isBalanced
                  ? (isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(34, 197, 94, 0.2)')
                  : remaining > 0
                    ? (isDark ? 'rgba(251, 191, 36, 0.2)' : 'rgba(251, 191, 36, 0.2)')
                    : (isDark ? 'rgba(239, 68, 68, 0.2)' : 'rgba(239, 68, 68, 0.2)'),
              },
            ]}>
            <ThemedText
              style={[
                styles.remainingText,
                {
                  color: isBalanced
                    ? (isDark ? '#2DD4BF' : '#22c55e')
                    : remaining > 0
                      ? (isDark ? '#fbbf24' : '#f59e0b')
                      : (isDark ? '#ef4444' : '#dc2626'),
                },
              ]}>
              {isBalanced
                ? '✓ Balanced'
                : `${remaining > 0 ? 'Remaining' : 'Over'}: ${formatCurrency(Math.abs(remaining), currency)}`}
            </ThemedText>
          </View>
        )}
      </View>

      <View
        style={[
          styles.splitSummary,
          {
            backgroundColor: colors.card,
            borderColor: splitProgress.isBalanced
              ? (isDark ? 'rgba(45, 212, 191, 0.32)' : 'rgba(34, 197, 94, 0.28)')
              : (isDark ? 'rgba(251, 191, 36, 0.32)' : 'rgba(245, 158, 11, 0.28)'),
          },
        ]}
        accessibilityLabel={`Split total ${formatCurrency(splitProgress.allocated, currency)} of ${formatCurrency(totalAmount, currency)}`}>
        <View style={styles.splitSummaryTopline}>
          <View>
            <ThemedText style={[styles.splitSummaryLabel, { color: colors.textSecondary }]}>
              Live split total
            </ThemedText>
            <View style={styles.splitSummaryTotalRow}>
              <ThemedText style={[styles.splitSummaryTotal, { color: colors.text }]}>
                {formatCurrency(splitProgress.allocated, currency)}
              </ThemedText>
              <ThemedText style={[styles.splitSummaryTotalContext, { color: colors.textSecondary }]}>
                {`of ${formatCurrency(totalAmount, currency)}`}
              </ThemedText>
            </View>
          </View>
          <ThemedText
            style={[
              styles.splitSummaryStatus,
              {
                color: splitProgress.isBalanced
                  ? (isDark ? '#2DD4BF' : '#16A34A')
                  : (isDark ? '#FBBF24' : '#B45309'),
              },
            ]}>
            {splitProgress.isBalanced
              ? readyLabel
              : `${splitProgress.remaining > 0 ? formatCurrency(splitProgress.remaining, currency) + ' left' : formatCurrency(Math.abs(splitProgress.remaining), currency) + ' over'}`}
          </ThemedText>
        </View>

        {splitProgress.people.map(person => {
          const participant = participants.find(p => p.id === person.userId);
          const personName = participant?.isCurrentUser ? 'You' : (participant?.name || 'Member');
          return (
            <View key={person.userId} style={styles.splitSummaryRow}>
              <ThemedText style={[styles.splitSummaryPerson, { color: colors.textSecondary }]}>
                {personName}
              </ThemedText>
              <ThemedText style={[styles.splitSummaryAmount, { color: colors.text }]}>
                {formatCurrency(person.amount, currency)}
              </ThemedText>
            </View>
          );
        })}

        {!splitProgress.isBalanced && !!onSetEvenSplit && (
          <TouchableOpacity
            onPress={onSetEvenSplit}
            accessibilityRole="button"
            accessibilityLabel="Set equal amounts for everyone"
            style={[
              styles.balanceButton,
              {
                backgroundColor: isDark ? 'rgba(45, 212, 191, 0.16)' : 'rgba(34, 197, 94, 0.12)',
              },
            ]}>
            <IconSymbol name="arrow.triangle.2.circlepath" size={16} color={isDark ? '#2DD4BF' : colors.tint} />
            <ThemedText style={[styles.balanceButtonText, { color: isDark ? '#2DD4BF' : colors.tint }]}>
              Set equal amounts
            </ThemedText>
          </TouchableOpacity>
        )}
      </View>

      {participants.map(participant => {
        const isYou = !!participant.isCurrentUser;
        const value =
          splitMethod === SplitMethod.UNEQUAL
            ? (customAmounts[participant.id] ?? '')
            : splitMethod === SplitMethod.PERCENTAGE
              ? (customPercentages[participant.id] ?? '')
              : (customShares[participant.id] ?? '');

        let calculatedAmount = 0;
        if (splitMethod === SplitMethod.PERCENTAGE) {
          const percentage = parseFloat(customPercentages[participant.id] || '0');
          calculatedAmount = (totalAmount * percentage) / 100;
        } else if (splitMethod === SplitMethod.SHARES) {
          const shares = parseFloat(customShares[participant.id] || '0');
          const totalShares = participants.reduce(
            (sum, p) => sum + parseFloat(customShares[p.id] || '0'),
            0
          );
          calculatedAmount = totalShares > 0 ? (totalAmount * shares) / totalShares : 0;
        }

        const initial = isYou ? 'You' : (participant.name.trim().charAt(0).toUpperCase() || '?');

        return (
          <View
            key={participant.id}
            style={[
              styles.customSplitCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}>
            <UserAvatar
              name={isYou ? 'You' : participant.name}
              initials={initial}
              size={28}
              backgroundColor={isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)'}
              textColor={isDark ? '#2DD4BF' : colors.tint}
              style={styles.customSplitAvatar}
            />
            <ThemedText style={[styles.customSplitName, { color: colors.text }]}>
              {isYou ? 'You (payer)' : participant.name}
            </ThemedText>
            <TextInput
              style={[
                styles.customSplitInput,
                {
                  backgroundColor: isDark ? '#05080e' : 'rgba(255,255,255,0.9)',
                  color: isDark ? '#fff' : colors.text,
                  borderWidth: 1,
                  borderColor: colors.border,
                },
              ]}
              value={value}
              onChangeText={text => {
                if (splitMethod === SplitMethod.UNEQUAL) {
                  onChangeCustomAmount(participant.id, normalizeCurrencyInput(text));
                } else if (splitMethod === SplitMethod.PERCENTAGE) {
                  onChangeCustomPercentage(participant.id, text);
                } else {
                  onChangeCustomShare(participant.id, text);
                }
              }}
              placeholder="0"
              placeholderTextColor={isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'}
              keyboardType="decimal-pad"
              testID={isYou ? 'custom-split-you-input' : 'custom-split-participant-input'}
            />
            <ThemedText style={[styles.customSplitSuffix, { color: colors.textSecondary }]}>
              {splitMethod === SplitMethod.UNEQUAL
                ? getCurrencySymbol(currency)
                : splitMethod === SplitMethod.PERCENTAGE
                  ? '%'
                  : 'x'}
            </ThemedText>
            {(splitMethod === SplitMethod.PERCENTAGE || splitMethod === SplitMethod.SHARES) && (
              <ThemedText style={[styles.calculatedAmount, { color: colors.textSecondary }]}>
                {formatCurrency(calculatedAmount, currency)}
              </ThemedText>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  remainingBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  remainingText: {
    fontSize: 13,
    fontWeight: '600',
  },
  splitSummary: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    paddingBottom: 16,
    gap: 8,
    marginBottom: 14,
  },
  splitSummaryTopline: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    paddingBottom: 4,
  },
  splitSummaryLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  splitSummaryTotal: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  splitSummaryTotalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  splitSummaryTotalContext: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  splitSummaryStatus: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
    paddingTop: 4,
  },
  splitSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 24,
    paddingTop: 4,
  },
  splitSummaryPerson: {
    fontSize: 13,
    lineHeight: 22,
    includeFontPadding: true,
  },
  splitSummaryAmount: {
    fontSize: 13,
    lineHeight: 22,
    includeFontPadding: true,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  balanceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 40,
    borderRadius: 10,
    marginTop: 6,
  },
  balanceButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  customSplitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
    marginBottom: 8,
  },
  customSplitAvatar: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  customSplitName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  customSplitInput: {
    width: 80,
    height: 36,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
  },
  customSplitSuffix: {
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 4,
  },
  calculatedAmount: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 8,
  },
});
