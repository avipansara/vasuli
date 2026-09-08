import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColors } from '@/hooks/use-theme-colors';
import type { GroupPairTotal } from '@/services/group-pair-totals-service';
import { formatCurrency } from '@/utils/currency';
import { getFirstName } from '@/utils/validation';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Alert, Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type BilateralLine = Pick<GroupPairTotal, 'fromUserId' | 'toUserId' | 'amount' | 'currency'>;

export type MemberBilateralLinesProps = {
  lines: BilateralLine[];
  namesById: Map<string, string>;
  currentUserId: string;
  memberUserId?: string;
  members?: { userId: string; user?: { name?: string } }[];
  onSettle: (line: BilateralLine) => void;
  onRemindAll?: () => void;
};

/**
 * Splitwise-style bilateral breakdown matching the Member Balances design:
 * Separates pair balances into PENDING (with avatars, owes you/you owe, and Record button)
 * and SETTLED (with checkmark and settled label).
 */
export function MemberBilateralLines({
  lines,
  namesById,
  currentUserId,
  memberUserId,
  members,
  onSettle,
  onRemindAll,
}: MemberBilateralLinesProps) {
  const { colors, isDark } = useThemeColors();
  const targetUserId = memberUserId || currentUserId;

  // Expanding entrance animation
  const [animOpacity] = useState(() => new Animated.Value(0));
  const [animTranslateY] = useState(() => new Animated.Value(-10));

  useEffect(() => {
    Animated.parallel([
      Animated.timing(animOpacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(animTranslateY, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [animOpacity, animTranslateY]);

  // Separate pending lines (amount >= 0.01)
  const pendingLines = lines.filter(l => l.amount >= 0.01);
  const pendingOtherUserIds = new Set(
    pendingLines.map(l => (l.fromUserId === targetUserId ? l.toUserId : l.fromUserId)),
  );

  // Derive settled members from other group members who do not have a pending debt with target
  const otherMembers = (members ?? []).filter(m => m.userId !== targetUserId);
  const settledMembers = otherMembers.filter(m => !pendingOtherUserIds.has(m.userId));

  const handleRemindPress = () => {
    if (onRemindAll) {
      onRemindAll();
      return;
    }
    void Haptics.notificationAsync?.(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Reminders Sent', 'Reminded all pending members to settle up.');
  };

  const hasPending = pendingLines.length > 0;
  const hasSettled = settledMembers.length > 0;

  if (!hasPending && !hasSettled) {
    return (
      <View style={[styles.card, {
        backgroundColor: colors.card,
        borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9',
      }]}>
        <ThemedText style={[styles.emptyText, { color: isDark ? '#94A3B8' : colors.textSecondary }]}>
          No outstanding balances
        </ThemedText>
      </View>
    );
  }

  return (
    <Animated.View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9',
          opacity: animOpacity,
          transform: [{ translateY: animTranslateY }],
        },
      ]}>
      {/* PENDING SECTION */}
      {hasPending && (
        <View testID="bilateral-pending-section" style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <ThemedText style={[styles.sectionHeading, { color: isDark ? '#94A3B8' : '#64748B' }]}>
              {`PENDING (${pendingLines.length})`}
            </ThemedText>
            {targetUserId === currentUserId && (
              <TouchableOpacity
                testID="bilateral-remind-all"
                accessibilityRole="button"
                accessibilityLabel="Remind all pending members"
                onPress={handleRemindPress}
                hitSlop={8}>
                <ThemedText style={[styles.remindAllText, { color: isDark ? '#10B981' : '#047857' }]}>
                  Remind all
                </ThemedText>
              </TouchableOpacity>
            )}
          </View>

          <View style={[styles.divider, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9' }]} />

          {pendingLines.map((line, index) => {
            const key = `${line.fromUserId}-${line.toUserId}-${line.currency}`;
            const otherId = line.fromUserId === targetUserId ? line.toUserId : line.fromUserId;
            const otherName = getFirstName(namesById.get(otherId) ?? 'Member');
            const targetName = getFirstName(namesById.get(targetUserId) ?? 'them');

            const isTargetCreditor = line.toUserId === targetUserId;
            const isViewerParty = line.fromUserId === currentUserId || line.toUserId === currentUserId;

            let relationCopy = '';
            if (targetUserId === currentUserId) {
              relationCopy = isTargetCreditor ? 'owes you' : 'you owe';
            } else {
              relationCopy = isTargetCreditor ? `owes ${targetName}` : `${targetName} owes`;
            }

            const amountColor = isTargetCreditor
              ? isDark ? '#10B981' : '#047857'
              : isDark ? '#F87171' : '#DC2626';

            return (
              <View key={key}>
                <View
                  testID={`bilateral-line-${key}`}
                  style={styles.pendingRow}>
                  {/* Avatar */}
                  <View
                    style={[
                      styles.avatarCircle,
                      { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9' },
                    ]}>
                    <Text style={[styles.avatarLetter, { color: isDark ? '#E2E8F0' : '#1E293B' }]}>
                      {otherName.charAt(0).toUpperCase() || '?'}
                    </Text>
                  </View>

                  {/* Member Name + Balance Info */}
                  <View style={styles.memberInfoCol}>
                    <View style={styles.nameRow}>
                      <ThemedText style={[styles.memberName, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>
                        {otherName}
                      </ThemedText>
                      <ThemedText style={[styles.relationText, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                        {` ${relationCopy}`}
                      </ThemedText>
                    </View>
                    <ThemedText style={[styles.amountText, { color: amountColor }]}>
                      {formatCurrency(line.amount, line.currency)}
                    </ThemedText>
                  </View>

                  {/* Record Button */}
                  {isViewerParty && (
                    <TouchableOpacity
                      testID={`bilateral-settle-${key}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Record payment of ${formatCurrency(line.amount, line.currency)} with ${otherName}`}
                      onPress={() => onSettle(line)}
                      activeOpacity={0.7}
                      style={[
                        styles.recordButton,
                        {
                          backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#E6F9F0',
                          borderColor: isDark ? 'rgba(16, 185, 129, 0.3)' : 'rgba(4, 120, 87, 0.2)',
                        },
                      ]}>
                      <Text style={[styles.recordButtonText, { color: isDark ? '#10B981' : '#047857' }]}>
                        Record
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                {index < pendingLines.length - 1 && (
                  <View style={[styles.rowDivider, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9' }]} />
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* SETTLED SECTION */}
      {hasSettled && (
        <View
          testID="bilateral-settled-section"
          style={[styles.section, hasPending && styles.settledSectionMargin]}>
          <ThemedText style={[styles.sectionHeading, { color: isDark ? '#94A3B8' : '#64748B' }]}>
            {`SETTLED (${settledMembers.length})`}
          </ThemedText>

          <View style={styles.settledList}>
            {settledMembers.map(member => {
              const name = getFirstName(namesById.get(member.userId) || member.user?.name || 'Member');
              return (
                <View key={member.userId} style={styles.settledRow}>
                  <View style={styles.settledLeft}>
                    <IconSymbol
                      name="checkmark"
                      size={14}
                      color={isDark ? '#94A3B8' : '#64748B'}
                      style={styles.checkmarkIcon}
                    />
                    <ThemedText style={[styles.settledMemberName, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                      {name}
                    </ThemedText>
                  </View>
                  <ThemedText style={[styles.settledLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                    Settled
                  </ThemedText>
                </View>
              );
            })}
          </View>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  section: {},
  settledSectionMargin: {
    marginTop: 20,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionHeading: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  remindAllText: {
    fontSize: 13,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    marginBottom: 8,
  },
  rowDivider: {
    height: 1,
    marginVertical: 4,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  avatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarLetter: {
    fontSize: 15,
    fontWeight: '700',
  },
  memberInfoCol: {
    flex: 1,
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberName: {
    fontSize: 15,
    fontWeight: '700',
  },
  relationText: {
    fontSize: 13,
    fontWeight: '400',
  },
  amountText: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  recordButton: {
    paddingHorizontal: 18,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 34,
  },
  recordButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  settledList: {
    gap: 12,
    marginTop: 12,
  },
  settledRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settledLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkmarkIcon: {
    marginRight: 8,
  },
  settledMemberName: {
    fontSize: 14,
    fontWeight: '500',
  },
  settledLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 8,
  },
});

