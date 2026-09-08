import {
  SettlementOperationCard,
  type SettlementDetailRow,
} from '@/components/settlements/settlement-operation-card';
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
import type { MutableRefObject } from 'react';
import type { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';

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

  const hasDetails = localTransfers.length > 0 || localCancellations.length > 0 || isDeleted || !isPayment;

  const extraDetailNotes: string[] = [];
  if (!isPayment) {
    extraDetailNotes.push('No payment was made in this group');
  }

  const detailRows: SettlementDetailRow[] = [];
  if (groupCash > 0) {
    detailRows.push({
      id: `cash-${operationId}`,
      title: 'Payment in this group',
      note: 'Cash recorded in this group',
      amount: formattedCash,
    });
  }
  for (const adjustment of localTransfers) {
    detailRows.push({
      id: adjustment.id,
      title: 'Balance adjustment',
      note: 'No additional payment',
      amount: formatCurrency(Math.abs(adjustment.signedGroupBalanceDelta), adjustment.currency),
    });
  }
  for (const cancellation of localCancellations) {
    detailRows.push({
      id: cancellation.id,
      title: 'Balance cleared',
      note: 'No additional payment',
      amount: formatCurrency(cancellation.amount, cancellation.currency),
    });
  }

  return (
    <SettlementOperationCard
      itemId={itemId}
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
      detailsAccessibilityHint="Shows this group's payment and balance adjustment history for this settlement"
      detailRows={detailRows}
      extraDetailNotes={extraDetailNotes}
      deleteAccessibilityLabel={deleteAccessibilityLabel}
      deleteAccessibilityHint={deleteAccessibilityHint}
      canDelete={canDelete}
      onDelete={onDelete}
      colors={colors}
      friendDetailTheme={friendDetailTheme}
      isDark={isDark}
      swipeableRefs={swipeableRefs}
      testID={`group-settlement-operation-${operationId}`}
      deleteTestID={`delete-group-settlement-operation-${operationId}`}
      detailsToggleTestID={`group-balance-details-toggle-${operationId}`}
    />
  );
}
