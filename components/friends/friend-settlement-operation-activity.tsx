import {
  SettlementOperationCard,
  type SettlementDetailRow,
} from '@/components/settlements/settlement-operation-card';
import type { FriendSettlementOperationItem } from '@/services/friend-detail-service';
import {
  getFriendOperationCashAmount,
  getFriendOperationDisplayKind,
} from '@/services/friend-settlement-operation-view';
import { formatCurrency } from '@/utils/currency';
import { getFirstName } from '@/utils/validation';
import type { MutableRefObject } from 'react';
import type { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';

type FriendSettlementOperationActivityProps = {
  item: FriendSettlementOperationItem;
  friendName: string;
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
  onOpenGroup?: (groupId: string) => void;
  swipeableRefs: MutableRefObject<Map<string, SwipeableMethods>>;
};

export function FriendSettlementOperationActivity({
  item,
  friendName,
  colors,
  friendDetailTheme,
  isDark,
  formatDate,
  canDelete,
  isDeleting = false,
  isDeletedOverride = false,
  onDelete,
  onOpenGroup,
  swipeableRefs,
}: FriendSettlementOperationActivityProps) {
  const projection = item.projection;
  const operationId = item.operationId;
  const isDeleted = projection.isDeleted || isDeletedOverride;
  const kind = getFriendOperationDisplayKind(projection);
  const isPayment = kind === 'payment';
  const firstName = getFirstName(friendName);
  const youPaid = item.direction === 'you_paid_friend';
  const cashAmount = getFriendOperationCashAmount(projection);
  const currency = projection.currency ?? 'USD';
  const formattedCash = formatCurrency(cashAmount, currency);

  // ADR-0001: one activity per operation. A payment leads with the actual
  // cash; a clearing never invents a cash amount from adjustments.
  const title = isPayment
    ? item.direction === undefined
      ? `Settlement with ${firstName}`
      : youPaid
        ? `You paid ${firstName}`
        : `${firstName} paid you`
    : `Balances cleared with ${firstName}`;
  const subtitle = isPayment
    ? `${formattedCash} · ${formatDate(item.date)}`
    : `No payment was made · ${formatDate(item.date)}`;

  const deleteAccessibilityLabel = isPayment
    ? `Delete settlement, ${formattedCash}, ${friendName}`
    : `Delete balance clearing with ${friendName}`;
  const deleteAccessibilityHint = isPayment
    ? 'Deletes this settlement and undoes linked balance adjustments after confirmation'
    : 'Undoes this balance clearing and linked balance adjustments after confirmation';

  const cancellations = projection.cancellations;
  const hasDetails = projection.adjustments.length > 0 || cancellations.length > 0 || isDeleted;

  const detailRows: SettlementDetailRow[] = [
    ...projection.adjustments.map(adjustment => {
      const groupName = item.groupNames?.[adjustment.groupId] ?? 'Shared group';
      return {
        id: adjustment.id,
        title: groupName,
        label: 'Balance adjustment',
        note: 'No additional payment',
        amount: formatCurrency(Math.abs(adjustment.signedGroupBalanceDelta), adjustment.currency),
        onPressTitle: onOpenGroup ? () => onOpenGroup(adjustment.groupId) : undefined,
        accessibilityTitleLabel: `Open ${groupName} group`,
      };
    }),
    ...cancellations.map(cancellation => {
      const groupName = item.groupNames?.[cancellation.groupId] ?? 'Shared group';
      return {
        id: cancellation.id,
        title: groupName,
        label: 'Balance cleared',
        note: 'No additional payment',
        amount: formatCurrency(cancellation.amount, cancellation.currency),
        onPressTitle: onOpenGroup ? () => onOpenGroup(cancellation.groupId) : undefined,
        accessibilityTitleLabel: `Open ${groupName} group`,
      };
    }),
  ];

  return (
    <SettlementOperationCard
      itemId={item.id}
      operationId={operationId}
      title={title}
      subtitle={subtitle}
      formattedCash={formattedCash}
      isPayment={isPayment}
      isDeleted={isDeleted}
      isDeleting={isDeleting}
      reversedAt={projection.reversedAt}
      formatDate={formatDate}
      hasDetails={hasDetails}
      detailsLabel="Balance details"
      detailsAccessibilityHint="Shows the balance adjustments included in this settlement"
      detailRows={detailRows}
      deleteAccessibilityLabel={deleteAccessibilityLabel}
      deleteAccessibilityHint={deleteAccessibilityHint}
      canDelete={canDelete}
      onDelete={onDelete}
      colors={colors}
      friendDetailTheme={friendDetailTheme}
      isDark={isDark}
      swipeableRefs={swipeableRefs}
      testID={`friend-settlement-operation-${operationId}`}
      deleteTestID={`delete-settlement-operation-${operationId}`}
      detailsToggleTestID={`friend-balance-details-toggle-${operationId}`}
    />
  );
}
