import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColors } from '@/hooks/use-theme-colors';
import type { FriendRelationshipProjection } from '@/services/friend-detail-service';
import type { User } from '@/types/database';
import { getDisplayName } from '@/utils/validation';
import { memo, useMemo } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import type { SharedValue } from 'react-native-reanimated';
import Reanimated, { useAnimatedStyle } from 'react-native-reanimated';

interface UserWithBalance extends User {
  balance: number;
  recentExpenses?: import('@/types/database').Expense[];
  relationship?: FriendRelationshipProjection;
}

interface FriendCardProps {
  friend: UserWithBalance;
  onPress?: (friend: UserWithBalance) => void;
  onDelete?: (friend: UserWithBalance) => void;
}

const SETTLED_BALANCE_THRESHOLD = 0.01;

function normalizeDisplayBalance(balance: number) {
  return Math.abs(balance) < SETTLED_BALANCE_THRESHOLD ? 0 : balance;
}

function formatBreakdownAmount(currency: string, amount: number) {
  return currency === 'USD' ? `$${amount.toFixed(2)}` : `${currency} ${amount.toFixed(2)}`;
}

function FriendDeleteAction({
  translation,
  backgroundColor,
  iconColor,
  onDelete,
}: {
  translation: SharedValue<number>;
  backgroundColor: string;
  iconColor: string;
  onDelete: () => void;
}) {
  const actionStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, -translation.get() / 80)),
  }));

  return (
    <Reanimated.View style={[styles.swipeActionRight, { backgroundColor }, actionStyle]}>
      <TouchableOpacity onPress={onDelete} style={styles.swipeActionButton}>
        <IconSymbol name="trash" size={20} color={iconColor} />
        <ThemedText style={[styles.swipeActionText, { color: iconColor }]}>Delete</ThemedText>
      </TouchableOpacity>
    </Reanimated.View>
  );
}

function areFriendCardPropsEqual(prev: FriendCardProps, next: FriendCardProps): boolean {
  if (prev.onPress !== next.onPress || prev.onDelete !== next.onDelete) {
    return false;
  }
  const a = prev.friend;
  const b = next.friend;
  if (a.id !== b.id || a.balance !== b.balance || a.name !== b.name || a.email !== b.email) {
    return false;
  }
  const ar = a.relationship;
  const br = b.relationship;
  if (Boolean(ar) !== Boolean(br)) return false;
  if (!ar || !br) return true;
  const aHasSeparateBalances = !ar.settleableTotal && ar.totalsByCurrency.filter(total => total.amount !== 0).length === 1;
  const bHasSeparateBalances = !br.settleableTotal && br.totalsByCurrency.filter(total => total.amount !== 0).length === 1;
  if (aHasSeparateBalances !== bHasSeparateBalances) return false;
  if (ar.directBalance !== br.directBalance || ar.directCurrency !== br.directCurrency) return false;
  if (ar.groupBalances.length !== br.groupBalances.length) return false;
  return ar.groupBalances.every((group, index) => {
    const nextGroup = br.groupBalances[index];
    return group.groupId === nextGroup.groupId
      && group.groupName === nextGroup.groupName
      && group.currency === nextGroup.currency
      && group.amount === nextGroup.amount
      && group.direction === nextGroup.direction;
  });
}

function FriendCardInner({ friend, onPress, onDelete }: FriendCardProps) {
  const { colors, friends: friendsTheme, isDark } = useThemeColors();
  const balance = normalizeDisplayBalance(friend.balance);
  const hasSeparateBalances = Boolean(
    friend.relationship
    && !friend.relationship.settleableTotal
    && friend.relationship.totalsByCurrency.filter(total => total.amount !== 0).length === 1
  );
  const displayName = getDisplayName(friend.name, friend.email);

  const balanceBreakdown = useMemo(() => {
    if (!friend.relationship) return [];

    const items: {
      id: string;
      label: string;
      amount: number;
      direction: 'you_owe' | 'you_are_owed';
      currency: string;
    }[] = [];
    const nonZeroGroupBalances = friend.relationship.groupBalances.filter(group => group.amount !== 0);

    for (const group of nonZeroGroupBalances) {
      items.push({
        id: `group:${group.groupId}:${group.currency}`,
        label: `in “${group.groupName}”`,
        amount: Math.abs(group.amount),
        direction: group.amount > 0 ? 'you_are_owed' : 'you_owe',
        currency: group.currency,
      });
    }

    if (friend.relationship.directBalance !== 0) {
      items.push({
        id: `direct:${friend.relationship.directCurrency ?? 'unknown'}`,
        label: 'in non-group expenses',
        amount: Math.abs(friend.relationship.directBalance),
        direction: friend.relationship.directBalance > 0 ? 'you_are_owed' : 'you_owe',
        currency: friend.relationship.directCurrency ?? 'USD',
      });
    }

    return items;
  }, [friend.relationship]);

  const avatarTextColor = colors.tint;
  const emailColor = colors.textSecondary;
  const branchTextColor = colors.textSecondary;

  const balanceColor =
    balance > 0
      ? colors.success
      : balance < 0
        ? colors.error
        : colors.tint;

  const cardStyle = useMemo(
    () => (isDark ? {
      backgroundColor: '#000000',
      borderWidth: 0,
      borderColor: 'rgba(255, 255, 255, 0.08)',
      shadowColor: '#64748b',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 4,
      elevation: 4,
    } : {
      backgroundColor: '#ffffff',
      borderWidth: 0,
      shadowColor: '#475569',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.09,
      shadowRadius: 0,
      elevation: 4,
    }),
    [isDark]
  );

  return (
    <ReanimatedSwipeable
      renderRightActions={onDelete ? (_progress, translation) => (
        <FriendDeleteAction
          translation={translation}
          backgroundColor={friendsTheme.dangerSurface}
          iconColor={friendsTheme.onDanger}
          onDelete={() => onDelete(friend)}
        />
      ) : undefined}
      overshootRight={false}
      friction={2}
      enableTrackpadTwoFingerGesture>
      <TouchableOpacity
        style={[styles.card, cardStyle]}
        onPress={() => onPress?.(friend)}
        activeOpacity={0.7}>
        <View style={styles.topSection}>
          <View
            style={[
              styles.avatar,
              { backgroundColor: isDark ? '#064e3b' : friendsTheme.avatarSurface },
            ]}>
            <ThemedText style={[styles.avatarText, { color: isDark ? '#10b981' : avatarTextColor }]}>
              {displayName.charAt(0).toUpperCase()}
            </ThemedText>
          </View>

          <View style={styles.headerInfoContainer}>
            <View style={styles.mainInfo}>
              <ThemedText
                type="defaultSemiBold"
                style={[styles.name, { color: isDark ? '#f8fafc' : colors.text }]}>
                {displayName}
              </ThemedText>
              {friend.email ? (
                <ThemedText numberOfLines={1} style={[styles.email, { color: isDark ? '#64748b' : emailColor }]}>
                  {friend.email}
                </ThemedText>
              ) : null}
            </View>

            <View style={styles.balanceContainer}>
              {balance !== 0 ? (
                <>
                  <ThemedText type='title' style={[styles.balanceAmount, { color: isDark ? (balance > 0 ? '#10b981' : '#ffb4ab') : balanceColor }]}>
                    ${Math.abs(balance).toFixed(2)}
                  </ThemedText>
                  <ThemedText
                    style={[styles.balanceLabel, { color: isDark ? '#64748b' : colors.textSecondary }]}
                  >
                    {hasSeparateBalances ? 'net balance' : balance > 0 ? 'owes you' : 'you owe'}
                  </ThemedText>
                </>
              ) : (
                <ThemedText style={[styles.settledText, { color: isDark ? '#10b981' : colors.tint }]}>
                  settled up ✓
                </ThemedText>
              )}
            </View>
          </View>
        </View>

        <View style={styles.bottomSection}>
          <View style={styles.branchSpacer} />
          <View style={styles.branchContainer}>
            {balance !== 0 ? (
              <View style={styles.balanceBreakdown}>
                {balanceBreakdown.length > 0 ? (
                  balanceBreakdown.map((item, index) => (
                    <View key={item.id} style={styles.expenseBranchItem}>
                      <View style={styles.branchGraphics}>
                        <View
                          style={[
                            styles.vLine,
                            {
                              backgroundColor: friendsTheme.branch,
                              height: index === balanceBreakdown.length - 1 ? '50%' : '100%'
                            }
                          ]}
                        />
                        <View style={[styles.hLine, { backgroundColor: friendsTheme.branch }]} />
                      </View>
                      <ThemedText numberOfLines={1} style={[styles.balanceBreakdownText, { color: branchTextColor }]}>
                        {item.direction === 'you_are_owed' ? `${displayName} owes you` : `You owe ${displayName}`}{' '}
                        <ThemedText style={{ color: item.direction === 'you_are_owed' ? colors.success : colors.error }}>
                          {formatBreakdownAmount(item.currency, item.amount)}
                        </ThemedText>{' '}
                        {item.label}
                      </ThemedText>
                    </View>
                  ))
                ) : (
                  <View style={styles.expenseBranchItem}>
                    <View style={styles.branchGraphics}>
                      <View style={[styles.vLine, { backgroundColor: friendsTheme.branch, height: '50%' }]} />
                      <View style={[styles.hLine, { backgroundColor: friendsTheme.branch }]} />
                    </View>
                    <ThemedText style={[styles.noExpenses, { color: colors.textSecondary }]}>
                      Balance details unavailable
                    </ThemedText>
                  </View>
                )}
              </View>
            ) : (
              <ThemedText style={[styles.settledNote, { color: colors.textSecondary }]}>
                All settled up
              </ThemedText>
            )}
          </View>
        </View>
      </TouchableOpacity>
    </ReanimatedSwipeable>
  );
}

export const FriendCard = memo(FriendCardInner, areFriendCardPropsEqual);

const styles = StyleSheet.create({
  card: {
    flexDirection: 'column',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
    borderRadius: 16,
  },
  topSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 22,
  },
  headerInfoContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  mainInfo: {
    flex: 1,
    marginRight: 8,
  },
  name: {
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 22,
  },
  email: {
    fontSize: 13,
    marginTop: 2,
  },
  bottomSection: {
    flexDirection: 'row',
    marginTop: 0,
  },
  branchSpacer: {
    width: 56, // avatar width (44) + avatar marginRight (12)
  },
  branchContainer: {
    flex: 1,
  },
  settledNote: {
    fontSize: 12,
    marginTop: 4,
    opacity: 0.8,
  },
  balanceBreakdown: {
    marginTop: 4,
  },
  expenseBranchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 22,
  },
  branchGraphics: {
    width: 20,
    height: '100%',
    marginRight: 4,
  },
  vLine: {
    position: 'absolute',
    width: 1.5,
    left: 8,
    top: 0,
  },
  hLine: {
    position: 'absolute',
    height: 1.5,
    width: 10,
    left: 8,
    top: 11,
  },
  balanceBreakdownText: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
    flex: 1,
  },
  noExpenses: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  balanceContainer: {
    alignItems: 'flex-end',
  },
  balanceAmount: {
    fontSize: 18,
  },
  balanceLabel: {
    fontSize: 12,
    marginTop: 2,
  },
  settledText: {
    fontSize: 13,
    fontWeight: '500',
  },
  chevron: {
    marginLeft: 8,
  },
  swipeActionRight: {
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 16,
    marginBottom: 10,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
  },
  swipeActionButton: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '100%',
  },
  swipeActionText: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
});
