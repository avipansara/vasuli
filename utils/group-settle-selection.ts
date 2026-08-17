import { SETTLED_BALANCE_THRESHOLD } from '@/services/group-balance';

export interface GroupSettleCandidate {
  balance: number;
}

export function isSettleableGroupBalance(balance: number): boolean {
  return Math.abs(balance) >= SETTLED_BALANCE_THRESHOLD;
}

export function getDefaultGroupSettleMember<T extends GroupSettleCandidate>(members: T[]): T | null {
  return members.find(member => isSettleableGroupBalance(member.balance)) ?? null;
}

export function getGroupSettleAmount(balance: number): string {
  return isSettleableGroupBalance(balance) ? Math.abs(balance).toFixed(2) : '';
}

export function canSubmitGroupSettlement(
  selectedMember: GroupSettleCandidate | null,
  amount: string,
  settling: boolean
): boolean {
  const parsedAmount = Number.parseFloat(amount);
  if (!selectedMember || settling || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
    return false;
  }
  const amountCents = Math.round(parsedAmount * 100);
  const maxCents = Math.round(Math.abs(selectedMember.balance) * 100);
  return amountCents <= maxCents;
}
