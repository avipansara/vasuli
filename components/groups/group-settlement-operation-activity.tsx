import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { SettlementOperationDeleteSwipeAction } from '@/components/settlements/settlement-operation-activity-shell';
import {
  getGroupOperationDisplayKind,
  getGroupOperationParticipants,
} from '@/services/group-settlement-operation-view';
import {
  getGroupLocalCashAmount,
  getGroupLocalTransfers,
  getGroupLocalCancellations,
  type SettlementOperationProjection,
} from '@/services/settlement-operation-projection';
import { formatCurrency } from '@/utils/currency';
import { getFirstName } from '@/utils/validation';
import { useState, type MutableRefObject } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';

type GroupSettlementOperationActivityProps = {
  projection: SettlementOperationProjection;
  groupId: string;
  currentUserId: string;
  payerName: string;
  payeeName: string;
  colors: Record<string, string>;
  friendDetailTheme: Record<string, string>;
  isDark: boolean;
  formatDate: (timestamp: number) => string;
  canDelete: boolean;
  isDeleting?: boolean;
  /**
   * Local post-success mark from the shared Delete flow. The server deleted
   * the operation but activity has not refreshed yet (or refresh failed), so
   * the row renders its Deleted state instead of looking settled.
   */
  isDeletedOverride?: boolean;
  onDelete: () => void;
  swipeableRefs: MutableRefObject<Map<string, SwipeableMethods>>;
};

export function GroupSettlementOperationActivity({
  projection,
  groupId,
  currentUserId,
  payerName,
  payeeName,
  colors,
  friendDetailTheme,
  isDark,
  formatDate,
  canDelete,
  isDeleting = false,
  isDeletedOverride = false,
  onDelete,
  swipeableRefs,
}: GroupSettlementOperationActivityProps) {
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const operationId = projection.operationId;
  const itemId = `group-operation:${operationId}`;
  const isDeleted = projection.isDeleted || isDeletedOverride;
  const kind = getGroupOperationDisplayKind(projection, groupId);
  const isPayment = kind === 'payment';
  const groupCash = getGroupLocalCashAmount(projection, groupId);
  const localTransfers = getGroupLocalTransfers(projection, groupId);
  const localCancellations = getGroupLocalCancellations(projection, groupId);
  const currency = projection.currency ?? localTransfers[0]?.currency ?? 'USD';
  const formattedCash = formatCurrency(groupCash, currency);

  const participants = getGroupOperationParticipants(projection, groupId);
  const payerFirst = getFirstName(payerName);
  const payeeFirst = getFirstName(payeeName);
  const isPayerYou = participants?.fromUserId === currentUserId;
  const isPayeeYou = participants?.toUserId === currentUserId;

  // ADR-0001: one group activity per operation. A group payment leads with the
  // cash recorded in THIS group; an adjustment-only entry reads as a clearing
  // and never uses paid wording. Only this group's history renders here.
  const title = isPayment
    ? isPayerYou
      ? `You paid ${payeeFirst}`
      : isPayeeYou
        ? `${payerFirst} paid you`
        : `${payerFirst} paid ${payeeFirst}`
    : 'Group balance cleared';
  const participantsLabel = isPayerYou
    ? `You and ${payeeFirst}`
    : isPayeeYou
      ? `${payerFirst} and you`
      : `${payerFirst} and ${payeeFirst}`;
  const subtitle = isPayment
    ? `${formattedCash} · ${formatDate(projection.originalDate)}`
    : `${participantsLabel} · ${formatDate(projection.originalDate)}`;

  const otherName = isPayerYou ? payeeName : payerName;
  const deleteAccessibilityLabel = isPayment
    ? `Delete settlement, ${formattedCash}, ${otherName}`
    : 'Delete balance clearing in this group';
  const deleteAccessibilityHint = isPayment
    ? 'Deletes this settlement and undoes linked balance adjustments, including in other groups, after confirmation'
    : 'Undoes this balance clearing and linked balance adjustments, including in other groups, after confirmation';

  const showDelete = canDelete && !isDeleted;
  const deleteDisabled = isDeleting;
  // Delete is swipe-only — no inline Delete button. Balance details stay
  // expandable for clearings, adjusted operations, and deleted history.
  const hasDetails = localTransfers.length > 0 || localCancellations.length > 0 || isDeleted || !isPayment;

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
          testID={`delete-group-settlement-operation-${operationId}`}
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
        testID={`group-settlement-operation-${operationId}`}
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
          {isPayment ? (
            <ThemedText type="subtitle" style={[styles.amount, { color: friendDetailTheme.activitySecondary }]}>
              {formattedCash}
            </ThemedText>
          ) : null}
        </View>
      </View>

      {hasDetails ? (
        <View style={[styles.detailsContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity
            testID={`group-balance-details-toggle-${operationId}`}
            accessibilityRole="button"
            accessibilityLabel={`Balance details for ${title}`}
            accessibilityHint="Shows this group's payment and balance adjustment history for this settlement"
            accessibilityState={{ expanded: detailsExpanded }}
            activeOpacity={0.7}
            onPress={() => setDetailsExpanded(expanded => !expanded)}
            style={styles.detailsToggle}>
            <ThemedText type="defaultSemiBold" style={[styles.detailsToggleText, { color: friendDetailTheme.activityTitle }]}>
              Balance details
            </ThemedText>
            <IconSymbol
              size={16}
              name={detailsExpanded ? 'chevron.up' : 'chevron.down'}
              color={friendDetailTheme.activitySecondary}
            />
          </TouchableOpacity>

          {detailsExpanded ? (
            <View>
              {isDeleted && projection.reversedAt ? (
                <ThemedText style={[styles.deletionDate, { color: friendDetailTheme.activitySecondary }]}>
                  {`Deleted on ${formatDate(projection.reversedAt)}`}
                </ThemedText>
              ) : null}
              {!isPayment ? (
                <ThemedText style={[styles.noPaymentNote, { color: friendDetailTheme.activitySecondary }]}>
                  No payment was made in this group
                </ThemedText>
              ) : null}
              {groupCash > 0 ? (
                <View style={styles.adjustmentRow}>
                  <View style={styles.adjustmentInfo}>
                    <ThemedText type="defaultSemiBold" style={[styles.groupName, { color: friendDetailTheme.activityTitle }]}>
                      Payment in this group
                    </ThemedText>
                    <ThemedText style={[styles.adjustmentNote, { color: friendDetailTheme.activitySecondary }]}>
                      Cash recorded in this group
                    </ThemedText>
                  </View>
                  <ThemedText type="defaultSemiBold" style={[styles.adjustmentAmount, { color: friendDetailTheme.activityTitle }]}>
                    {formattedCash}
                  </ThemedText>
                </View>
              ) : null}
              {localTransfers.map(adjustment => (
                <View key={adjustment.id} style={styles.adjustmentRow}>
                  <View style={styles.adjustmentInfo}>
                    <ThemedText type="defaultSemiBold" style={[styles.groupName, { color: friendDetailTheme.activityTitle }]}>
                      Balance adjustment
                    </ThemedText>
                    <ThemedText style={[styles.adjustmentNote, { color: friendDetailTheme.activitySecondary }]}>
                      No additional payment
                    </ThemedText>
                  </View>
                  <ThemedText type="defaultSemiBold" style={[styles.adjustmentAmount, { color: friendDetailTheme.activityTitle }]}>
                    {formatCurrency(Math.abs(adjustment.signedGroupBalanceDelta), adjustment.currency)}
                  </ThemedText>
                </View>
              ))}
              {localCancellations.map(cancellation => (
                <View key={cancellation.id} style={styles.adjustmentRow}>
                  <View style={styles.adjustmentInfo}>
                    <ThemedText type="defaultSemiBold" style={[styles.groupName, { color: friendDetailTheme.activityTitle }]}>
                      Balance cleared
                    </ThemedText>
                    <ThemedText style={[styles.adjustmentNote, { color: friendDetailTheme.activitySecondary }]}>
                      No additional payment
                    </ThemedText>
                  </View>
                  <ThemedText type="defaultSemiBold" style={[styles.adjustmentAmount, { color: friendDetailTheme.activityTitle }]}>
                    {formatCurrency(cancellation.amount, cancellation.currency)}
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
  noPaymentNote: {
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
  groupName: {
    fontSize: 14,
  },
  adjustmentNote: {
    fontSize: 12,
  },
  adjustmentAmount: {
    fontSize: 14,
    marginLeft: 8,
  },
  swipeActionRight: {
    width: 80,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    marginBottom: 8,
  },
  swipeActionButton: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  swipeActionText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
