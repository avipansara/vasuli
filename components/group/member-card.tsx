import { ThemedText } from '@/components/themed-text';
import {
  ACCENT_TEAL,
  BG_ICON_DARK,
  BG_ICON_LIGHT,
  ERROR_COLOR,
  SUCCESS_DARK,
} from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import type { GroupMember, User } from '@/types/database';
import { formatCurrency } from '@/utils/currency';
import { StyleSheet, View } from 'react-native';

interface MemberCardProps {
  member: GroupMember & { user?: User };
  balance: number;
}

export function MemberCard({ member, balance }: MemberCardProps) {
  const { colors, isDark } = useThemeColors();

  const balanceColor =
    balance > 0
      ? isDark ? SUCCESS_DARK : colors.success
      : balance < 0
        ? isDark ? ERROR_COLOR : colors.error
        : isDark ? ACCENT_TEAL : colors.tint;

  return (
    <View style={[styles.card, !isDark && { borderColor: colors.border }]}>
      <View
        style={[
          styles.avatar,
          { backgroundColor: isDark ? BG_ICON_DARK : BG_ICON_LIGHT },
        ]}>
        <ThemedText style={[styles.avatarText, { color: isDark ? ACCENT_TEAL : colors.tint }]}>
          {member.user?.name.charAt(0).toUpperCase() || '?'}
        </ThemedText>
      </View>
      <View style={styles.info}>
        <ThemedText
          type="defaultSemiBold"
          style={!isDark ? { color: colors.text } : undefined}>
          {member.user?.name || 'Unknown'}
        </ThemedText>
        {member.role === 'admin' && (
          <ThemedText style={[styles.roleLabel, { color: isDark ? ACCENT_TEAL : colors.tint }]}>
            Admin
          </ThemedText>
        )}
      </View>
      <View style={styles.balanceInfo}>
        {balance !== 0 ? (
          <>
            <ThemedText style={[styles.balanceAmount, { color: balanceColor }]}>
              {formatCurrency(Math.abs(balance))}
            </ThemedText>
            <ThemedText
              style={[styles.balanceLabel, !isDark && { color: colors.textSecondary }]}>
              {balance > 0 ? 'gets back' : 'owes'}
            </ThemedText>
          </>
        ) : (
          <ThemedText
            style={[styles.settledLabel, !isDark && { color: colors.textSecondary }]}>
            settled
          </ThemedText>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  info: {
    flex: 1,
  },
  roleLabel: {
    fontSize: 10,
    opacity: 0.6,
  },
  balanceInfo: {
    alignItems: 'flex-end',
  },
  balanceAmount: {
    fontSize: 14,
    fontWeight: '600',
  },
  balanceLabel: {
    fontSize: 11,
    opacity: 0.6,
  },
  settledLabel: {
    fontSize: 12,
    opacity: 0.6,
  },
});
