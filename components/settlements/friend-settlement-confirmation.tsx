import { ThemedText } from '@/components/themed-text';
import { SharedModal } from '@/components/ui/shared-modal';
import { useThemeColors } from '@/hooks/use-theme-colors';
import type { FriendGroupBalanceSummary } from '@/services/friend-detail-service';
import { settlementModule, type CombinedSettlementPlan } from '@/services/settlement-service';
import { formatCurrency, getCurrencySymbol } from '@/utils/currency';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

type Phase = 'editing' | 'confirming' | 'committing' | 'success' | 'stale' | 'retry' | 'error';

export type FriendSettlementConfirmationResult = {
  totalAmount: number;
  currency: string;
  reused: boolean;
};

function parseAmount(text: string): number | null {
  if (!text.trim()) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined;
}

export function FriendSettlementConfirmation({
  friendName,
  currentUserId,
  friendId,
  netAmount,
  currency,
  directBalance,
  groupBalances,
  onCommit,
  onRefresh,
  onDone,
  onCancel,
  bottomInset = 0,
}: {
  friendName: string;
  currentUserId: string;
  friendId: string;
  netAmount: number;
  currency: string;
  directBalance: number;
  groupBalances: FriendGroupBalanceSummary[];
  onCommit: (amount: number) => Promise<FriendSettlementConfirmationResult>;
  onRefresh: () => void;
  onDone: () => void;
  onCancel?: () => void;
  bottomInset?: number;
}) {
  const { colors, settle } = useThemeColors();
  const [amountText, setAmountText] = useState(() => Math.abs(netAmount).toFixed(2));
  const [phase, setPhase] = useState<Phase>('editing');
  const [phaseMessage, setPhaseMessage] = useState('');
  const [result, setResult] = useState<FriendSettlementConfirmationResult | null>(null);
  const maxAmount = Math.abs(netAmount);
  const amount = parseAmount(amountText);

  const plan = useMemo<CombinedSettlementPlan | null>(() => {
    if (
      amount === null
      || amount <= 0
      || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6
      || amount > maxAmount
    ) return null;

    try {
      return settlementModule.preview({
        currentUserId,
        friendId,
        currency,
        amount,
        directBalance,
        groupBalances,
      });
    } catch {
      return null;
    }
  }, [amount, currency, currentUserId, directBalance, friendId, groupBalances, maxAmount]);

  const validationError = maxAmount === 0
    ? null
    : amount === null || amount <= 0
      ? 'Enter an amount greater than zero.'
      : Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6
        ? 'Enter an amount with at most two decimal places.'
        : amount > maxAmount
          ? `Enter no more than ${formatCurrency(maxAmount, currency)}.`
          : plan === null
            ? 'This balance is no longer available. Refresh and try again.'
            : null;

  const canRecord = plan !== null && phase === 'editing' && maxAmount > 0;
  const direction = netAmount < 0 ? `You pay ${friendName}` : `${friendName} pays you`;
  const directionPastTense = netAmount < 0 ? `you paid ${friendName}` : `${friendName} paid you`;
  const activeGroups = groupBalances.filter(group => group.currency === currency && group.amount !== 0);
  const opposingDirectBalance = directBalance !== 0 && Math.sign(directBalance) !== Math.sign(netAmount);
  const isFullSettlement = amount !== null && Math.round(amount * 100) === Math.round(maxAmount * 100);
  const clearedScopeNames = plan?.cancellations.length
    ? [...new Set([
        ...plan.cancellations.map(cancellation => (
          groupBalances.find(group => group.groupId === cancellation.groupId)?.groupName ?? 'Group'
        )),
        ...(isFullSettlement && opposingDirectBalance ? ['Direct'] : []),
      ])]
    : [];

  const setQuickAmount = (percent: number) => {
    setAmountText((Math.round(maxAmount * percent * 100) / 100).toFixed(2));
  };

  const submit = async () => {
    if (plan === null || amount === null || amount <= 0) return;
    setPhase('committing');
    try {
      setResult(await onCommit(amount));
      setPhase('success');
    } catch (error) {
      const code = errorCode(error);
      setPhaseMessage(
        code === 'stale_balance'
          ? 'This balance changed. Refresh and try again.'
          : error instanceof Error
            ? error.message
            : 'The payment could not be confirmed.',
      );
      setPhase(code === 'stale_balance' ? 'stale' : code === 'transient' ? 'retry' : 'error');
    }
  };

  return (
    <View style={styles.content}>
      {maxAmount > 0 ? (
        <View style={styles.amountSection}>
          <ThemedText style={[styles.inputLabel, { color: settle.textSecondary }]}>Amount to settle</ThemedText>
          <View style={[styles.inputWrapper, { backgroundColor: settle.heroBackground, borderColor: settle.heroBorder }]}>
            <View style={styles.inputInnerRow}>
              <Text style={[styles.currency, { color: settle.accentText }]}>{getCurrencySymbol(currency)}</Text>
              <TextInput
                testID="friend-settlement-amount-input"
                value={amountText}
                onChangeText={setAmountText}
                keyboardType="decimal-pad"
                accessibilityLabel={`Payment amount, maximum ${formatCurrency(maxAmount, currency)}`}
                placeholder="0.00"
                placeholderTextColor={settle.textSecondary}
                selectTextOnFocus
                maxFontSizeMultiplier={1.4}
                style={[styles.input, { color: settle.accentText }]}
              />
            </View>
          </View>

          <View style={styles.quickSelectRow}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Settle half the balance"
              onPress={() => setQuickAmount(0.5)}
              style={[styles.quickSelectButton, { backgroundColor: settle.pillBackground }]}
            >
              <Text style={[styles.quickSelectText, { color: settle.textPrimary }]}>50%</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Settle the full balance"
              onPress={() => setQuickAmount(1)}
              style={[styles.quickSelectButton, { backgroundColor: settle.pillBackground }]}
            >
              <Text style={[styles.quickSelectText, { color: settle.textPrimary }]}>Full Balance</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {validationError ? (
        <ThemedText testID="friend-settlement-validation" accessibilityRole="alert" style={[styles.error, { color: colors.error }]}>
          {validationError}
        </ThemedText>
      ) : null}

      <View
        testID="friend-settlement-overall"
        accessibilityRole="summary"
        accessibilityLabel={maxAmount === 0 ? 'You are settled up overall' : `${direction}, ${formatCurrency(amount ?? 0, currency)}`}
      >
        <ThemedText style={[styles.helperText, { color: settle.textSecondary }]}>
          {maxAmount === 0 ? 'You are settled up overall' : `This records that ${directionPastTense} `}
          {maxAmount > 0 ? (
            <Text testID="friend-settlement-overall-amount" style={[styles.helperAmount, { color: settle.textPrimary }]}>
              {formatCurrency(amount ?? 0, currency)}
            </Text>
          ) : null}
          {maxAmount > 0 ? ' to settle up.' : null}
        </ThemedText>
      </View>

      <View
        testID="friend-settlement-breakdown"
        style={[styles.previewCard, { backgroundColor: settle.cardBackground, borderColor: settle.cardBorder }]}
      >
        <View testID="friend-settlement-preview" style={styles.previewContent}>
          <ThemedText style={[styles.previewTitle, { color: settle.textPrimary }]}>Settlement preview</ThemedText>

          {plan?.allocations.map((allocation, index) => (
            <View key={`${allocation.groupId ?? 'direct'}-${index}`} style={styles.previewRow}>
              <ThemedText style={[styles.previewLabel, { color: settle.textSecondary }]}>
                {allocation.groupId
                  ? groupBalances.find(group => group.groupId === allocation.groupId)?.groupName ?? 'Group'
                  : 'Direct'}
              </ThemedText>
              <ThemedText style={[styles.previewValue, { color: settle.textPrimary }]}>
                {formatCurrency(allocation.amount, currency)} payment
              </ThemedText>
            </View>
          ))}

          {clearedScopeNames.length > 0 ? (
            <View testID="friend-settlement-cleared-scopes" style={styles.previewRow}>
              <ThemedText style={[styles.previewLabel, { color: settle.textSecondary }]}>Also clears</ThemedText>
              <ThemedText style={[styles.previewValue, { color: settle.textPrimary }]}> 
                {clearedScopeNames.join(', ')}
              </ThemedText>
            </View>
          ) : null}

          {plan && plan.allocations.length > 0 && plan.cancellations.length === 0
            ? [
                ...(opposingDirectBalance ? [{ groupId: '__direct__', groupName: 'Direct' }] : []),
                ...activeGroups.filter(group => Math.sign(group.amount) !== Math.sign(netAmount)),
              ].map(group => (
                  <View key={group.groupId} style={styles.previewRow}>
                    <ThemedText style={[styles.previewLabel, { color: settle.textSecondary }]}>{group.groupName}</ThemedText>
                    <ThemedText style={[styles.previewValue, { color: settle.textPrimary }]}>Unchanged</ThemedText>
                  </View>
                ))
            : null}

          {maxAmount === 0 ? (
            <>
              {directBalance !== 0 ? (
                <View style={styles.previewRow}>
                  <ThemedText style={[styles.previewLabel, { color: settle.textSecondary }]}>Direct</ThemedText>
                  <ThemedText style={[styles.previewValue, { color: settle.textPrimary }]}>
                    {formatCurrency(Math.abs(directBalance), currency)} {directBalance < 0 ? 'you owe' : 'owed to you'}
                  </ThemedText>
                </View>
              ) : null}
              {activeGroups.map(group => (
                <View key={group.groupId} style={styles.previewRow}>
                  <ThemedText style={[styles.previewLabel, { color: settle.textSecondary }]}>{group.groupName}</ThemedText>
                  <ThemedText style={[styles.previewValue, { color: settle.textPrimary }]}>
                    {formatCurrency(Math.abs(group.amount), currency)} {group.amount < 0 ? 'you owe' : 'owed to you'}
                  </ThemedText>
                </View>
              ))}
            </>
          ) : null}

          <ThemedText style={[styles.previewFooter, { color: settle.textSecondary }]}>
            {maxAmount === 0
              ? 'No payment is needed.'
              : amount !== null && amount < maxAmount
                ? `Remaining overall: ${formatCurrency(maxAmount - amount, currency)}`
                : clearedScopeNames.length > 0
                  ? 'No extra payment. All balances will be cleared.'
                  : 'All balances will be cleared.'}
          </ThemedText>
        </View>
      </View>

      <View style={[styles.bottomActions, { paddingBottom: bottomInset }]}>
        {onCancel ? (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cancel settlement" onPress={onCancel} style={styles.cancelButton}>
            <Text style={[styles.cancelButtonText, { color: settle.textSecondary }]}>Cancel</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          testID="friend-settlement-record-button"
          accessibilityRole="button"
          accessibilityLabel="Review settlement"
          accessibilityState={{ disabled: !canRecord }}
          disabled={!canRecord}
          onPress={() => setPhase('confirming')}
          style={[styles.button, { backgroundColor: settle.buttonBackground, opacity: canRecord ? 1 : 0.45 }]}
        >
          <Text style={[styles.buttonText, { color: settle.buttonText }]}>Review settlement</Text>
        </TouchableOpacity>
      </View>

      <SharedModal
        visible={phase !== 'editing'}
        onClose={() => phase !== 'committing' && setPhase('editing')}
        title="Confirm settlement"
        subtitle={phase === 'success' ? 'Settlement recorded.' : `You are recording one settlement with ${friendName}.`}
        icon="banknote"
      >
        {phase === 'confirming' || phase === 'committing' ? (
          <View testID="friend-settlement-confirmation">
            <ThemedText style={[styles.modalText, { color: colors.text }]}>
              {netAmount < 0 ? `You pay ${friendName}` : `${friendName} pays you`} {formatCurrency(amount ?? 0, currency)} once.
            </ThemedText>
            {clearedScopeNames.length > 0 ? (
              <ThemedText style={[styles.modalDetail, { color: colors.textSecondary }]}> 
                Also clears balances in {clearedScopeNames.join(', ')}. No extra payment.
              </ThemedText>
            ) : null}
            <TouchableOpacity
              testID="friend-settlement-confirm-button"
              accessibilityRole="button"
              accessibilityLabel="Confirm settlement"
              accessibilityState={{ disabled: phase === 'committing' }}
              disabled={phase === 'committing'}
              onPress={() => void submit()}
              style={[styles.button, { backgroundColor: settle.buttonBackground }]}
            >
              <Text style={[styles.buttonText, { color: settle.buttonText }]}>{phase === 'committing' ? 'Recording…' : 'Confirm'}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {phase === 'success' ? (
          <View testID="friend-settlement-success">
            <ThemedText style={[styles.modalText, { color: colors.text }]}>
              {result
                ? `${netAmount < 0 ? `You paid ${friendName}` : `${friendName} paid you`} ${formatCurrency(result.totalAmount, result.currency)} once.`
                : 'Settlement recorded.'}
            </ThemedText>
            {result?.reused ? (
              <ThemedText style={[styles.modalDetail, { color: colors.textSecondary }]}>This settlement was already recorded.</ThemedText>
            ) : null}
            <TouchableOpacity testID="friend-settlement-done-button" accessibilityRole="button" accessibilityLabel="Done" onPress={onDone} style={[styles.button, { backgroundColor: settle.buttonBackground }]}>
              <Text style={[styles.buttonText, { color: settle.buttonText }]}>Done</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {phase === 'stale' || phase === 'retry' || phase === 'error' ? (
          <View testID={`friend-settlement-${phase}`}>
            <ThemedText style={[styles.modalText, { color: colors.text }]}>{phaseMessage}</ThemedText>
            {phase === 'stale' ? (
              <TouchableOpacity testID="friend-settlement-refresh-button" accessibilityRole="button" accessibilityLabel="Refresh balances" onPress={() => { setPhase('editing'); onRefresh(); }} style={styles.modalTextButton}>
                <Text style={{ color: settle.accentText }}>Refresh balances</Text>
              </TouchableOpacity>
            ) : null}
            {phase === 'retry' ? (
              <TouchableOpacity testID="friend-settlement-retry-button" accessibilityRole="button" accessibilityLabel="Retry settlement" onPress={() => void submit()} style={styles.modalTextButton}>
                <Text style={{ color: settle.accentText }}>Retry</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </SharedModal>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16 },
  amountSection: { gap: 10 },
  inputLabel: { fontSize: 12, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 1, marginLeft: 4 },
  inputWrapper: { alignItems: 'center', justifyContent: 'center', borderRadius: 20, minHeight: 104, paddingHorizontal: 20, borderWidth: 1 },
  inputInnerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%' },
  currency: { fontSize: 22, fontWeight: '700' },
  input: { width: '72%', maxWidth: 260, flexShrink: 1, padding: 0, margin: 0, fontSize: 40, fontWeight: '800', fontVariant: ['tabular-nums'], textAlign: 'left' },
  quickSelectRow: { flexDirection: 'row', gap: 10 },
  quickSelectButton: { flex: 1, minHeight: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12 },
  quickSelectText: { fontSize: 15, fontWeight: '600' },
  error: { fontSize: 14, lineHeight: 20, marginTop: -16 },
  helperText: { fontSize: 14, lineHeight: 20, textAlign: 'center', paddingHorizontal: 8 },
  helperAmount: { fontWeight: '700' },
  previewCard: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 10 },
  previewContent: { gap: 8 },
  previewTitle: { fontSize: 17, fontWeight: '700' },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  previewLabel: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 20 },
  previewValue: { flexShrink: 1, fontSize: 14, fontWeight: '600', lineHeight: 20, textAlign: 'right' },
  previewFooter: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  bottomActions: { gap: 4, alignItems: 'center' },
  cancelButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 },
  cancelButtonText: { fontSize: 15, fontWeight: '600' },
  button: { width: '100%', minHeight: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  buttonText: { fontSize: 16, fontWeight: '600' },
  modalText: { fontSize: 16, lineHeight: 23, marginBottom: 8 },
  modalDetail: { fontSize: 14, lineHeight: 20, marginBottom: 8 },
  modalTextButton: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
});
