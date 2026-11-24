import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { SharedModal } from '@/components/ui/shared-modal';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { formatCurrency, toCents } from '@/utils/currency';
import { getEvenSplitValues, getSplitProgress, resolveExpenseSplits, type CalculatedSplit } from '@/utils/split-validation';
import { useRef, useState } from 'react';
import { router, Stack } from 'expo-router';
import { useExpenseSplitSheet } from './expense-split-sheet-host';
import { ThemedButton } from '@/components/ui/themed-button';
import { ThemedIconButton } from '@/components/ui/themed-icon-button';
import { Keyboard, Platform, ScrollView, StyleSheet, TextInput, TouchableOpacity, View, type ScrollViewInstance } from 'react-native';
import { CustomSplitBreakdown } from './custom-split-breakdown';
import { SplitMethodSelector } from './split-method-selector';
import { hasSameAllocation } from '@/utils/saved-expense-split';
import { SplitMethod, type ExpenseParticipant, type ExpenseSplitDraft } from './expense-split-types';

interface Props {
  value: ExpenseSplitDraft;
  onApply: (split: ExpenseSplitDraft) => void;
  people: ExpenseParticipant[];
  group: boolean;
  currentUserId: string;
  amount: number;
  currency: string;
  description: string;
  canEditPayer?: boolean;
  savedSplits?: CalculatedSplit[];
  previous?: { payerId: string; splits: CalculatedSplit[] };
}

export function ExpenseSplitField(props: Props) {
  const { value, people, group, currentUserId, amount, currency, canEditPayer = true, savedSplits, previous } = props;
  const { colors, settle } = useThemeColors();
  const [editing, setEditing] = useState(false);
  const sheet = useExpenseSplitSheet();
  const friend = group ? undefined : people.find(person => person.id !== currentUserId);
  const quickSplit = !!friend && people.length === 2 && canEditPayer;
  const reimbursesPayer = !!friend && people.length === 2 &&
    isFullReimbursement(value, value.payerId, value.payerId === currentUserId ? friend.id : currentUserId);
  const money = (number: number) => formatCurrency(number, currency);
  const name = (id: string) => people.find(person => person.id === id)?.name;
  const payerName = name(value.payerId);
  const label = value.method === SplitMethod.EQUAL ? 'Split equally' : value.method === SplitMethod.UNEQUAL
    ? 'Custom amounts' : value.method === SplitMethod.PERCENTAGE ? 'By percentage' : 'By shares';
  const summary = reimbursesPayer
    ? (value.payerId === currentUserId ? `You paid for ${friend.name}` : `${payerName} paid for you`)
    : `${value.payerId === currentUserId ? 'You paid' : `${payerName} paid`} · ${label}`;

  const resolve = (split: ExpenseSplitDraft) => resolveExpenseSplits(split.participantIds, amount, split.method, {
    amounts: split.values, percentages: split.values, shares: split.values,
  });
  const result = savedSplits ? { splits: savedSplits } : resolve(value);
  const shares = result.splits?.map(split => split.amount) ?? [];
  const sameShare = shares.length > 0 && shares.every(share => share === shares[0]);
  const outcome = (payerId: string, splits: CalculatedSplit[]) => getOutcome(payerId, splits, currentUserId, name, money);
  const preview = amount > 0 && result.splits ? outcome(value.payerId, result.splits) : null;
  const previousPreview = previous && outcome(previous.payerId, previous.splits);
  const remaining = value.method === SplitMethod.UNEQUAL
    ? getSplitProgress(value.participantIds, amount, value.method, value.values).remaining : 0;
  const row = [styles.row, { borderColor: colors.border, backgroundColor: colors.card }];

  return (
    <View style={styles.field}>
      <TouchableOpacity
        testID="expense-split-button"
        accessibilityRole="button"
        accessibilityHint="Change the payer or how the expense is split"
        style={row}
        onPress={() => {
          Keyboard.dismiss();
          if (Platform.OS === 'ios') {
            sheet.open(<ExpenseSplitEditor {...props} onClose={() => router.back()} nativeSheet />, !quickSplit);
          } else {
            setEditing(true);
          }
        }}>
        <IconSymbol name="person.2.fill" size={20} color={colors.tint} />
        <View style={styles.rowCopy}>
          <ThemedText style={styles.title}>{summary}</ThemedText>
          <ThemedText style={{ color: colors.textSecondary }}>
            {reimbursesPayer ? 'Full amount' : quickSplit ? `You and ${friend.name}`
              : `${value.participantIds.length} ${value.participantIds.length === 1 ? 'person' : 'people'}`}
            {amount > 0 && value.method === SplitMethod.EQUAL && sameShare ? ` · ${money(shares[0])} each` : ''}
          </ThemedText>
          {group && value.participantIds.length < people.length && (
            <ThemedText style={{ color: colors.textSecondary }} numberOfLines={2}>
              {value.participantIds.map(name).join(', ')}
            </ThemedText>
          )}
        </View>
        <IconSymbol name="chevron.right" size={14} color={colors.textSecondary} />
      </TouchableOpacity>
      {!!preview && (
        <View style={[styles.outcome, { backgroundColor: settle.heroBackground, borderColor: settle.heroBorder }]}>
          <ThemedText style={[styles.title, { color: settle.accentText }]}>{preview}</ThemedText>
          {!!previousPreview && previousPreview !== preview && (
            <ThemedText style={{ color: colors.textSecondary }}>Previously: {previousPreview}</ThemedText>
          )}
        </View>
      )}
      {amount > 0 && !result.splits && (
        <ThemedText accessibilityRole="alert" style={{ color: colors.error }}>
          {toCents(remaining) > 0 ? `${money(remaining)} left to assign` :
            toCents(remaining) < 0 ? `${money(-remaining)} over the expense total` : 'Adjust the split before saving'}
        </ThemedText>
      )}
      {editing && <ExpenseSplitEditor {...props} onClose={() => setEditing(false)} />}
    </View>
  );
}

function isFullReimbursement(split: ExpenseSplitDraft, payerId: string, recipientId: string) {
  return payerId !== recipientId && split.payerId === payerId && split.method === SplitMethod.PERCENTAGE &&
    split.participantIds.length === 2 && split.participantIds.includes(payerId) &&
    split.participantIds.includes(recipientId) &&
    Number(split.values[payerId]) === 0 && Number(split.values[recipientId]) === 100;
}

function getOutcome(payerId: string, splits: CalculatedSplit[], currentUserId: string, name: (id: string) => string | undefined, money: (amount: number) => string) {
  if (payerId === currentUserId) {
    const others = splits.filter(split => split.userId !== payerId && split.amount > 0);
    if (others.length === 1 && name(others[0].userId)) {
      return `${name(others[0].userId)} owes you ${money(others[0].amount)}`;
    }
    if (others.length === 2 && others[0].amount === others[1].amount &&
        others.every(split => name(split.userId))) {
      return `${others.map(split => name(split.userId)).join(' and ')} each owe you ${money(others[0].amount)}`;
    }
    const owed = splits.filter(split => split.userId !== payerId).reduce((sum, split) => sum + toCents(split.amount), 0) / 100;
    return owed > 0
      ? `You’re owed ${money(owed)}`
      : 'No one owes you for this expense';
  }
  const owed = splits.find(split => split.userId === currentUserId)?.amount ?? 0;
  return owed > 0 ? `You owe ${name(payerId)} ${money(owed)}` : 'You owe nothing for this expense';
}

function ExpenseSplitEditor({
  value, onApply, people, group, currentUserId, amount, currency, description,
  canEditPayer = true, onClose, nativeSheet = false,
}: Props & { onClose: () => void; nativeSheet?: boolean }) {
  const { colors, settle } = useThemeColors();
  const friend = group ? undefined : people.find(person => person.id !== currentUserId);
  const [draft, setDraft] = useState(value);
  const [memberSelection, setMemberSelection] = useState<string[] | null>(null);
  const [memberSearch, setMemberSearch] = useState('');
  const sheetScroll = useRef<ScrollViewInstance>(null);
  const [customize, setCustomize] = useState(!friend || people.length !== 2 || !canEditPayer);
  const money = (number: number) => formatCurrency(number, currency);
  const name = (id: string) => people.find(person => person.id === id)?.name;
  const outcome = (payerId: string, splits: CalculatedSplit[]) => getOutcome(payerId, splits, currentUserId, name, money);
  const resolve = (split: ExpenseSplitDraft) => resolveExpenseSplits(split.participantIds, amount, split.method, {
    amounts: split.values, percentages: split.values, shares: split.values,
  });
  const draftResult = resolve(draft);
  const invalid = draft.participantIds.length === 0 || (amount > 0 && !draftResult.splits);
  const title = memberSelection ? 'Split between' : customize ? 'Customize split' : 'How was this split?';
  const selectedCount = draft.participantIds.length;
  const query = memberSearch.trim().toLocaleLowerCase();
  const visibleMembers = people.filter(person =>
    person.name.toLocaleLowerCase().includes(query));
  const closeMembers = () => {
    Keyboard.dismiss();
    setMemberSelection(null);
    sheetScroll.current?.scrollTo({ y: 0, animated: false });
  };
  const finishMembers = () => {
    if (!memberSelection?.length) return;
    setDraft(current => ({ ...current, participantIds: memberSelection }));
    closeMembers();
  };
  const insetGroup = [styles.insetGroup, { backgroundColor: colors.card }];
  const listDivider = { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border };
  const changeShare = (id: string, text: string) => setDraft(current =>
    ({ ...current, values: { ...current.values, [id]: text } }));
  const apply = (split: ExpenseSplitDraft) => {
    if (split.payerId !== value.payerId || !hasSameAllocation(split, value)) onApply(split);
    onClose();
  };

  const allMembersSelected = memberSelection?.length === people.length;
  const memberPicker = memberSelection && (
    <>
      <View style={[styles.listRow, insetGroup]}>
        <IconSymbol name="magnifyingglass" size={17} color={colors.textSecondary} />
        <TextInput
          testID="expense-split-member-search"
          accessibilityLabel="Search members"
          placeholder="Search members"
          placeholderTextColor={colors.textSecondary}
          value={memberSearch}
          onChangeText={setMemberSearch}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={[styles.memberSearch, { color: colors.text }]}
        />
      </View>
      <View style={styles.memberPickerBar}>
        <ThemedText accessibilityLiveRegion="polite" style={{ color: colors.textSecondary }}>
          {memberSelection.length} of {people.length} selected
        </ThemedText>
        <TouchableOpacity accessibilityRole="button" style={styles.memberPickerAction}
          onPress={() => setMemberSelection(allMembersSelected ? [] : people.map(person => person.id))}>
          <ThemedText type="defaultSemiBold" style={{ color: colors.tint }}>
            {allMembersSelected ? 'Clear all' : 'Select all'}
          </ThemedText>
        </TouchableOpacity>
      </View>
      {visibleMembers.length ? (
        <View style={insetGroup}>
          {visibleMembers.map((person, index) => {
            const checked = memberSelection.includes(person.id);
            return (
              <TouchableOpacity key={person.id} testID="expense-split-member-option"
                style={[styles.listRow, index > 0 && listDivider]}
                accessibilityRole="checkbox" accessibilityLabel={person.name} accessibilityState={{ checked }}
                onPress={() => setMemberSelection(current => current && (
                  current.includes(person.id) ? current.filter(id => id !== person.id)
                    : people.filter(item => item.id === person.id || current.includes(item.id)).map(item => item.id)
                ))}>
                <View style={[styles.checkbox, { borderColor: checked ? colors.tint : colors.textSecondary }]}>
                  {checked && <IconSymbol name="checkmark" size={14} color={colors.tint} />}
                </View>
                <ThemedText style={styles.rowCopy}>{person.name}</ThemedText>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : (
        <ThemedText style={[styles.detail, { color: colors.textSecondary }]}>No members match your search.</ThemedText>
      )}
      {memberSelection.length === 0 && (
        <ThemedText accessibilityRole="alert" style={{ color: colors.error }}>Choose at least one person.</ThemedText>
      )}
    </>
  );

  const content = (
    <>
    {amount > 0 && (
      <ThemedText style={[styles.detail, { color: colors.textSecondary }]}>
        {description.trim() ? `${money(amount)} · ${description.trim()}` : money(amount)}
      </ThemedText>
    )}
    {!customize && friend ? (
      <>
        <View style={insetGroup}>
          {[
            { payerId: currentUserId, label: 'You paid, split equally', full: false },
            { payerId: friend.id, label: `${friend.name} paid, split equally`, full: false },
            { payerId: currentUserId, label: `You paid for ${friend.name}`, full: true },
            { payerId: friend.id, label: `${friend.name} paid for you`, full: true },
          ].map((option, index) => {
            const otherId = option.payerId === currentUserId ? friend.id : currentUserId;
            const next = {
              payerId: option.payerId,
              participantIds: [currentUserId, friend.id],
              method: option.full ? SplitMethod.PERCENTAGE : SplitMethod.EQUAL,
              values: option.full ? { [otherId]: '100', [option.payerId]: '0' } : {},
            };
            const checked = option.full ? isFullReimbursement(value, option.payerId, otherId)
              : value.payerId === next.payerId && value.method === next.method &&
                value.participantIds.length === 2;
            const splits = resolve(next).splits;
            return (
              <TouchableOpacity key={option.label}
                style={[styles.listRow, index > 0 && listDivider]}
                accessibilityRole="radio" accessibilityState={{ checked }} onPress={() => apply(next)}>
                <View style={[styles.choiceIcon, { backgroundColor: settle.pillBackground }]}>
                  <IconSymbol name={option.full ? 'person.fill' : 'person.2.fill'} color={colors.tint} size={16} />
                </View>
                <View style={styles.rowCopy}>
                  <ThemedText style={styles.choiceTitle}>{option.label}</ThemedText>
                  {amount > 0 && splits && (
                    <ThemedText style={{ color: colors.textSecondary }}>{outcome(next.payerId, splits)}</ThemedText>
                  )}
                </View>
                {checked && <IconSymbol name="checkmark" size={18} color={colors.tint} />}
              </TouchableOpacity>
            );
          })}
        </View>
        <TouchableOpacity style={[styles.listRow, styles.customAction]} accessibilityRole="button"
          accessibilityLabel="Customize split" onPress={() => setCustomize(true)}>
          <ThemedText type="defaultSemiBold" style={[styles.rowCopy, { color: colors.tint }]}>Customize split</ThemedText>
          <IconSymbol name="chevron.right" size={14} color={colors.textSecondary} />
        </TouchableOpacity>
      </>
    ) : (
      <>
        <ThemedText style={styles.title}>{canEditPayer ? 'Paid by' : `Paid by ${name(draft.payerId)}`}</ThemedText>
        {canEditPayer && <View style={styles.payers}>
          {people.map(person => {
            const checked = draft.payerId === person.id;
            return (
              <TouchableOpacity key={person.id} style={[styles.payer, {
                backgroundColor: checked ? settle.buttonBackground : colors.card,
                borderColor: checked ? settle.buttonBackground : colors.border,
              }]} accessibilityRole="radio" accessibilityLabel={`Paid by ${person.id === currentUserId ? 'you' : person.name}`}
              accessibilityState={{ checked }} onPress={() => setDraft({ ...draft, payerId: person.id })}>
                <ThemedText style={{ color: checked ? settle.buttonText : colors.text }}>{person.name}</ThemedText>
              </TouchableOpacity>
            );
          })}
        </View>}
        {group && (
          <TouchableOpacity testID="expense-split-members-button" accessibilityRole="button"
            style={[styles.listRow, insetGroup]} onPress={() => {
              setMemberSearch('');
              setMemberSelection(draft.participantIds);
              sheetScroll.current?.scrollTo({ y: 0, animated: false });
            }}>
            <View style={[styles.choiceIcon, { backgroundColor: settle.pillBackground }]}>
              <IconSymbol name="person.2.fill" size={16} color={colors.tint} />
            </View>
            <View style={styles.rowCopy}>
              <ThemedText style={styles.choiceTitle}>Split between</ThemedText>
              <ThemedText style={{ color: colors.textSecondary }}>
                {selectedCount === people.length ? 'Everyone · ' : ''}
                {selectedCount} {selectedCount === 1 ? 'person' : 'people'}
              </ThemedText>
            </View>
            <IconSymbol name="chevron.right" size={14} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
        <SplitMethodSelector splitMethod={draft.method} onSelectSplitMethod={method => {
          if (method !== draft.method) {
            setDraft({ ...draft, method, values: getEvenSplitValues(draft.participantIds, method, amount) });
          }
        }} />
        {draft.method !== SplitMethod.EQUAL && draft.participantIds.length > 0 && (
          <CustomSplitBreakdown
            splitMethod={draft.method}
            totalAmount={amount}
            currency={currency}
            participants={people.filter(person => draft.participantIds.includes(person.id))}
            customAmounts={draft.values}
            customPercentages={draft.values}
            customShares={draft.values}
            onChangeCustomAmount={changeShare}
            onChangeCustomPercentage={changeShare}
            onChangeCustomShare={changeShare}
            splitProgress={getSplitProgress(draft.participantIds, amount, draft.method, draft.values)}
            onSetEvenSplit={() => setDraft({ ...draft, values: getEvenSplitValues(draft.participantIds, draft.method, amount) })}
            readyLabel="Ready to apply"
          />
        )}
        {!draft.participantIds.length && <ThemedText style={{ color: colors.error }}>Choose at least one person.</ThemedText>}
      </>
    )}
    </>
  );
  if (!nativeSheet) {
    return (
      <SharedModal visible onClose={memberSelection ? closeMembers : onClose} title={title} subtitle="" icon="person.2.fill"
        scrollTestID="expense-split-scroll" headerStyle="centered" submitIcon="checkmark"
        submitLabel={memberSelection ? 'Done' : customize ? 'Apply split' : undefined}
        submitDisabled={memberSelection ? memberSelection.length === 0 : invalid}
        onSubmit={memberSelection ? finishMembers : customize ? () => apply(draft) : undefined}>
        {memberSelection ? memberPicker : content}
      </SharedModal>
    );
  }
  return (
    <>
      {customize && <Stack.Screen options={{ sheetAllowedDetents: [0.94] }} />}
      <ScrollView ref={sheetScroll} testID="expense-split-scroll" style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled"
        stickyHeaderIndices={memberSelection ? [0] : undefined} automaticallyAdjustKeyboardInsets>
        <View style={{ backgroundColor: colors.background }}>
          <View style={styles.sheetHeading}>
            {!!memberSelection && (
              <ThemedIconButton name="chevron.left" size={17} shape="circle" accessibilityLabel="Cancel member selection"
                onPress={closeMembers} style={{ backgroundColor: colors.card, borderColor: colors.border }} />
            )}
            <ThemedText accessibilityRole="header" type="title" style={styles.sheetTitle}>{title}</ThemedText>
            {memberSelection ? (
              <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: !memberSelection.length }}
                disabled={!memberSelection.length} onPress={finishMembers} style={styles.memberPickerAction}>
                <ThemedText type="defaultSemiBold" style={{ color: memberSelection.length ? colors.tint : colors.textSecondary }}>Done</ThemedText>
              </TouchableOpacity>
            ) : (
              <ThemedIconButton name="xmark" size={17} shape="circle" accessibilityLabel="Close split"
                onPress={onClose} style={{ backgroundColor: colors.card, borderColor: colors.border }} />
            )}
          </View>
        </View>
        {memberSelection ? memberPicker : content}
        {customize && !memberSelection && <ThemedButton label="Apply split" onPress={() => apply(draft)} disabled={invalid} />}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  field: { gap: 8 },
  sheetContent: { paddingTop: 22, paddingHorizontal: 20, paddingBottom: 32 },
  sheetHeading: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  sheetTitle: { flex: 1, fontSize: 24 },
  insetGroup: { borderRadius: 18, borderCurve: 'continuous', overflow: 'hidden', marginBottom: 14 },
  listRow: {
    minHeight: 48, paddingHorizontal: 13, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 11,
  },
  memberSearch: { flex: 1, fontFamily: 'Manrope_400Regular', fontSize: 15, paddingVertical: 0 },
  memberPickerBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  memberPickerAction: { minHeight: 44, minWidth: 44, justifyContent: 'center' },
  choiceIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  choiceTitle: { fontSize: 15, fontFamily: 'Manrope_600SemiBold' },
  customAction: { justifyContent: 'space-between', marginTop: -6 },
  row: {
    minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
  },
  rowCopy: { flex: 1 },
  checkbox: { width: 20, height: 20, borderWidth: 1, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  title: { fontWeight: '700' },
  outcome: { borderWidth: 1, borderRadius: 12, padding: 12 },
  detail: { marginBottom: 12 },
  payers: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 10 },
  payer: { minHeight: 48, justifyContent: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 12 },
});
