import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { SettlementOperationDeleteSwipeAction } from '@/components/settlements/settlement-operation-activity-shell';
import { useState, type MutableRefObject } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';

export type SettlementDetailRow = {
  id: string;
  title: string;
  label?: string;
  note?: string;
  amount: string;
  onPressTitle?: () => void;
  accessibilityTitleLabel?: string;
};

export type SettlementOperationCardProps = {
  itemId: string;
  operationId: string;
  title: string;
  subtitle: string;
  formattedCash?: string;
  isPayment: boolean;
  isDeleted: boolean;
  isDeleting?: boolean;
  reversedAt?: number;
  formatDate: (timestamp: number) => string;
  hasDetails: boolean;
  detailsLabel?: string;
  detailsAccessibilityHint?: string;
  detailRows: SettlementDetailRow[];
  extraDetailNotes?: string[];
  deleteAccessibilityLabel: string;
  deleteAccessibilityHint: string;
  canDelete: boolean;
  onDelete: () => void;
  colors: Record<string, string>;
  friendDetailTheme: Record<string, string>;
  isDark: boolean;
  swipeableRefs: MutableRefObject<Map<string, SwipeableMethods>>;
  testID?: string;
  deleteTestID?: string;
  detailsToggleTestID?: string;
};

export function SettlementOperationCard({
  itemId,
  operationId,
  title,
  subtitle,
  formattedCash,
  isPayment,
  isDeleted,
  isDeleting = false,
  reversedAt,
  formatDate,
  hasDetails,
  detailsLabel = 'Balance details',
  detailsAccessibilityHint = 'Shows the balance adjustments included in this settlement',
  detailRows,
  extraDetailNotes,
  deleteAccessibilityLabel,
  deleteAccessibilityHint,
  canDelete,
  onDelete,
  colors,
  friendDetailTheme,
  isDark,
  swipeableRefs,
  testID,
  deleteTestID,
  detailsToggleTestID,
}: SettlementOperationCardProps) {
  const [detailsExpanded, setDetailsExpanded] = useState(false);

  const showDelete = canDelete && !isDeleted;
  const deleteDisabled = isDeleting;

  const handleDeletePress = () => {
    if (deleteDisabled) return;
    swipeableRefs.current.get(itemId)?.close();
    onDelete();
  };

  return (
    <ReanimatedSwipeable
      ref={(ref) => {
        if (ref) swipeableRefs.current.set(itemId, ref);
        else swipeableRefs.current.delete(itemId);
      }}
      renderRightActions={showDelete ? (_progress, translation) => (
        <SettlementOperationDeleteSwipeAction
          translation={translation}
          backgroundColor={friendDetailTheme.dangerSurface}
          iconColor={friendDetailTheme.danger}
          onPress={handleDeletePress}
          accessibilityLabel={deleteAccessibilityLabel}
          accessibilityHint={deleteAccessibilityHint}
          disabled={deleteDisabled}
          testID={deleteTestID ?? `delete-settlement-operation-${operationId}`}
        />
      ) : undefined}
      overshootRight={false}
      friction={2}
      overshootFriction={8}
      enableTrackpadTwoFingerGesture
      containerStyle={{ overflow: 'visible' }}>
      <View
        accessible
        accessibilityRole="text"
        accessibilityActions={showDelete && !deleteDisabled ? [{ name: 'delete', label: deleteAccessibilityLabel }] : undefined}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'delete') handleDeletePress();
        }}
        accessibilityLabel={`${title}, ${subtitle}${isDeleted ? ', Deleted' : ''}${isDeleting ? ', Deleting' : ''}${detailsExpanded ? ', Balance details expanded' : ''}`}
        testID={testID ?? `settlement-operation-${operationId}`}
        style={[
          styles.card,
          {
            backgroundColor: colors.card,
            borderWidth: 0,
            borderColor: colors.border,
            shadowColor: friendDetailTheme.activityShadow,
            shadowOffset: { width: 0, height: isDark ? 4 : 2 },
            shadowOpacity: isDark ? 0.15 : 0.09,
            shadowRadius: isDark ? 4 : 0,
            elevation: 4,
          },
        ]}>
        <View style={[styles.icon, {
          backgroundColor: friendDetailTheme.positiveSurface,
          borderRadius: 20,
          width: 40,
          height: 40,
        }]}>
          <IconSymbol size={20} name="checkmark.circle.fill" color={friendDetailTheme.positive} />
        </View>
        <View style={styles.info}>
          <ThemedText type="subtitle" style={[styles.title, { color: friendDetailTheme.activityTitle }]} numberOfLines={1}>
            {title}
          </ThemedText>
          <ThemedText style={[styles.subtitle, { color: friendDetailTheme.activitySecondary }]} numberOfLines={2}>
            {subtitle}
          </ThemedText>
          {isDeleted ? (
            <View style={[styles.badge, { backgroundColor: friendDetailTheme.activityBadgeSurface }]}>
              <ThemedText style={[styles.badgeText, { color: friendDetailTheme.activitySecondary }]}>
                Deleted
              </ThemedText>
            </View>
          ) : isDeleting ? (
            <View style={[styles.badge, { backgroundColor: friendDetailTheme.activityBadgeSurface }]}>
              <ThemedText style={[styles.badgeText, { color: friendDetailTheme.activitySecondary }]}>
                Deleting…
              </ThemedText>
            </View>
          ) : (
            <View style={[styles.badge, { backgroundColor: friendDetailTheme.activityBadgeSurface }]}>
              <ThemedText style={[styles.badgeText, { color: friendDetailTheme.activitySecondary }]}>
                Settled
              </ThemedText>
            </View>
          )}
        </View>
        <View style={styles.amountBlock}>
          {isPayment && formattedCash ? (
            <ThemedText type="subtitle" style={[styles.amount, { color: friendDetailTheme.activitySecondary }]}>
              {formattedCash}
            </ThemedText>
          ) : null}
        </View>
      </View>

      {hasDetails ? (
        <View style={[styles.detailsContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity
            testID={detailsToggleTestID ?? `balance-details-toggle-${operationId}`}
            accessibilityRole="button"
            accessibilityLabel={`Balance details for ${title}`}
            accessibilityHint={detailsAccessibilityHint}
            accessibilityState={{ expanded: detailsExpanded }}
            activeOpacity={0.7}
            onPress={() => setDetailsExpanded(expanded => !expanded)}
            style={styles.detailsToggle}>
            <ThemedText type="defaultSemiBold" style={[styles.detailsToggleText, { color: friendDetailTheme.activityTitle }]}>
              {detailsLabel}
            </ThemedText>
            <IconSymbol
              size={16}
              name={detailsExpanded ? 'chevron.up' : 'chevron.down'}
              color={friendDetailTheme.activitySecondary}
            />
          </TouchableOpacity>

          {detailsExpanded ? (
            <View>
              {isDeleted && reversedAt ? (
                <ThemedText style={[styles.deletionDate, { color: friendDetailTheme.activitySecondary }]}>
                  {`Deleted on ${formatDate(reversedAt)}`}
                </ThemedText>
              ) : null}
              {extraDetailNotes?.map((note, index) => (
                <ThemedText key={`note-${index}`} style={[styles.extraNote, { color: friendDetailTheme.activitySecondary }]}>
                  {note}
                </ThemedText>
              ))}
              {detailRows.map(row => (
                <View key={row.id} style={styles.adjustmentRow}>
                  <View style={styles.adjustmentInfo}>
                    {row.onPressTitle ? (
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel={row.accessibilityTitleLabel ?? row.title}
                        hitSlop={12}
                        activeOpacity={0.7}
                        onPress={row.onPressTitle}>
                        <ThemedText type="defaultSemiBold" style={[styles.rowTitle, { color: friendDetailTheme.activityTitle }]}>
                          {row.title}
                        </ThemedText>
                      </TouchableOpacity>
                    ) : (
                      <ThemedText type="defaultSemiBold" style={[styles.rowTitle, { color: friendDetailTheme.activityTitle }]}>
                        {row.title}
                      </ThemedText>
                    )}
                    {row.label ? (
                      <ThemedText style={[styles.adjustmentLabel, { color: friendDetailTheme.activitySecondary }]}>
                        {row.label}
                      </ThemedText>
                    ) : null}
                    {row.note ? (
                      <ThemedText style={[styles.adjustmentNote, { color: friendDetailTheme.activitySecondary }]}>
                        {row.note}
                      </ThemedText>
                    ) : null}
                  </View>
                  <ThemedText type="defaultSemiBold" style={[styles.adjustmentAmount, { color: friendDetailTheme.activityTitle }]}>
                    {row.amount}
                  </ThemedText>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 0,
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.09,
    shadowRadius: 0,
    elevation: 4,
  },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  info: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    flexShrink: 1,
    fontSize: 16,
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    marginTop: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  amountBlock: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingLeft: 8,
  },
  amount: {
    fontSize: 16,
    marginBottom: 4,
  },
  detailsContainer: {
    marginTop: -4,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 0,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  detailsToggle: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  detailsToggleText: {
    fontSize: 14,
  },
  deletionDate: {
    fontSize: 12,
    marginBottom: 8,
  },
  extraNote: {
    fontSize: 12,
    marginBottom: 8,
  },
  adjustmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  adjustmentInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowTitle: {
    fontSize: 14,
  },
  adjustmentLabel: {
    fontSize: 12,
  },
  adjustmentNote: {
    fontSize: 12,
  },
  adjustmentAmount: {
    fontSize: 14,
    marginLeft: 8,
  },
});
