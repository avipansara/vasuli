import { ThemedText } from '@/components/themed-text';
import { useThemeColors } from '@/hooks/use-theme-colors';
import type { BilateralLine } from '@/utils/group-bilateral-matrix';
import { formatCurrency } from '@/utils/currency';
import { getFirstName } from '@/utils/validation';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type MemberBilateralLinesProps = {
  lines: BilateralLine[];
  namesById: Map<string, string>;
  currentUserId: string;
  onSettle: (line: BilateralLine) => void;
};

function lineCopy(
  line: BilateralLine,
  namesById: Map<string, string>,
  currentUserId: string,
): string {
  const amount = formatCurrency(line.amount, line.currency);
  if (line.fromUserId === currentUserId) {
    return `You owe ${amount} to ${getFirstName(namesById.get(line.toUserId) ?? 'them')}`;
  }
  if (line.toUserId === currentUserId) {
    return `${getFirstName(namesById.get(line.fromUserId) ?? 'Someone')} owes ${amount} to you`;
  }
  return `${getFirstName(namesById.get(line.fromUserId) ?? 'Someone')} owes ${amount} to ${getFirstName(namesById.get(line.toUserId) ?? 'them')}`;
}

/**
 * Splitwise-style bilateral breakdown under one member row: one line per
 * nonzero pair debt involving the member, with a Settle up action for
 * lines the viewer is party to.
 */
export function MemberBilateralLines({ lines, namesById, currentUserId, onSettle }: MemberBilateralLinesProps) {
  const { colors, settle, isDark } = useThemeColors();

  if (lines.length === 0) {
    return (
      <ThemedText style={[styles.emptyText, { color: isDark ? '#94A3B8' : colors.textSecondary }]}>
        No outstanding pair debts
      </ThemedText>
    );
  }

  return (
    <View style={styles.list}>
      {lines.map(line => {
        const key = `${line.fromUserId}-${line.toUserId}-${line.currency}`;
        const involvesViewer = line.fromUserId === currentUserId || line.toUserId === currentUserId;
        return (
          <View
            key={key}
            testID={`bilateral-line-${key}`}
            style={[styles.line, { borderColor: isDark ? 'rgba(255,255,255,0.08)' : colors.border }]}>
            <ThemedText style={[styles.lineText, { color: isDark ? '#E2E8F0' : colors.text }]}>
              {lineCopy(line, namesById, currentUserId)}
            </ThemedText>
            {involvesViewer && (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`Settle up ${formatCurrency(line.amount, line.currency)}`}
                testID={`bilateral-settle-${key}`}
                onPress={() => onSettle(line)}
                style={[styles.settleButton, { backgroundColor: settle.buttonBackground, minHeight: 44 }]}>
                <Text style={[styles.settleButtonText, { color: settle.buttonText }]}>Settle up</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 8,
    paddingTop: 8,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderTopWidth: 1,
    paddingTop: 8,
  },
  lineText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  emptyText: {
    fontSize: 13,
    paddingTop: 8,
  },
  settleButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settleButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
