export type SplitMethod = 'equal' | 'unequal' | 'percentage' | 'shares';

export interface SplitProgress {
  allocated: number;
  remaining: number;
  isBalanced: boolean;
  people: { userId: string; amount: number }[];
}

const toNumber = (value: string | undefined) => {
  const parsed = Number.parseFloat(value || '0');
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

export function getSplitProgress(
  userIds: string[],
  totalAmount: number,
  method: SplitMethod,
  values: Record<string, string>
): SplitProgress {
  const total = Math.max(0, totalAmount);
  const rawValues = userIds.map(userId => ({ userId, value: toNumber(values[userId]) }));

  if (method === 'equal') {
    const amount = userIds.length > 0 ? total / userIds.length : 0;
    return {
      allocated: total,
      remaining: 0,
      isBalanced: userIds.length > 0,
      people: userIds.map(userId => ({ userId, amount })),
    };
  }

  if (method === 'percentage') {
    const percentageTotal = rawValues.reduce((sum, item) => sum + item.value, 0);
    const people = rawValues.map(item => ({ userId: item.userId, amount: total * item.value / 100 }));
    return {
      allocated: total * percentageTotal / 100,
      remaining: total * (100 - percentageTotal) / 100,
      isBalanced: Math.abs(percentageTotal - 100) < 0.01,
      people,
    };
  }

  if (method === 'shares') {
    const totalShares = rawValues.reduce((sum, item) => sum + item.value, 0);
    const people = rawValues.map(item => ({
      userId: item.userId,
      amount: totalShares > 0 ? total * item.value / totalShares : 0,
    }));
    return { allocated: totalShares > 0 ? total : 0, remaining: totalShares > 0 ? 0 : total, isBalanced: totalShares > 0, people };
  }

  const allocated = rawValues.reduce((sum, item) => sum + item.value, 0);
  return {
    allocated,
    remaining: total - allocated,
    isBalanced: Math.abs(total - allocated) < 0.01,
    people: rawValues.map(item => ({ userId: item.userId, amount: item.value })),
  };
}

export function getEvenSplitValues(userIds: string[], method: SplitMethod, totalAmount = 0): Record<string, string> {
  if (method === 'percentage') {
    const each = userIds.length > 0 ? 100 / userIds.length : 0;
    return Object.fromEntries(userIds.map(userId => [userId, each.toFixed(2)]));
  }

  if (method === 'shares') {
    return Object.fromEntries(userIds.map(userId => [userId, '1']));
  }

  const each = userIds.length > 0 ? totalAmount / userIds.length : 0;
  const values = Object.fromEntries(userIds.map(userId => [userId, each.toFixed(2)]));
  if (userIds.length > 0) {
    const roundedTotal = userIds.slice(0, -1).reduce((sum, userId) => sum + Number(values[userId]), 0);
    values[userIds[userIds.length - 1]] = Math.max(0, totalAmount - roundedTotal).toFixed(2);
  }
  return values;
}
