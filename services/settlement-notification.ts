import type { User } from '@/types/database';
import type { CombinedSettlementReceipt } from './settlement-service';

export async function sendSettlementNotification({
  receipt, currentUser, friend, groupId,
}: {
  receipt: CombinedSettlementReceipt;
  currentUser: User;
  friend: User;
  groupId?: string;
}): Promise<void> {
  if (receipt.reused || receipt.totalAmount <= 0) return;
  try {
    const { userService } = await import('./user-service');
    const recipient = await userService.getById(friend.id);
    if (!recipient?.pushToken) return;
    const { createSettlementNotification, notificationService } = await import('./notification-service');
    const currentUserPaid = receipt.direction === 'you_paid_friend';
    await notificationService.sendPushNotification(recipient.pushToken, createSettlementNotification(
      currentUser.name || 'Someone',
      (currentUserPaid ? currentUser.name : friend.name) || 'Someone',
      (currentUserPaid ? friend.name : currentUser.name) || 'Someone',
      receipt.totalAmount,
      receipt.currency,
      currentUser.id,
      groupId,
    ));
  } catch (error) {
    console.warn('Settlement notification failed after commit:', error);
  }
}
