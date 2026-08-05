export function getPendingInvitationCount(
  pendingFriendRequestCount: number,
  pendingEmailInvitationCount: number,
): number {
  return pendingFriendRequestCount + pendingEmailInvitationCount;
}
