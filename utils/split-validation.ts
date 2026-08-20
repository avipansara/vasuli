export type SplitMethod = 'equal' | 'unequal' | 'percentage' | 'shares';

export interface SplitProgress {
  allocated: number;
  remaining: number;
  isBalanced: boolean;
  people: { userId: string; amount: number }[];
}

export interface CalculatedSplit {
  userId: string;
  amount: number;
  splitType: 'equal' | 'exact' | 'percentage';
  percentage?: number;
}

export interface SplitCalculationResult {
  splits: CalculatedSplit[] | null;
  error?: string;
}

interface ParsedSplitValue {
  value: number;
  isValid: boolean;
}

const parseSplitValue = (value: string | undefined): ParsedSplitValue => {
  if (!value?.trim()) return { value: 0, isValid: true };

  const parsed = Number(value);
  return {
    value: Number.isFinite(parsed) && parsed >= 0 ? parsed : 0,
    isValid: Number.isFinite(parsed) && parsed >= 0,
  };
};

const toCents = (amount: number) => Math.round(amount * 100);

const allocateCentsByWeight = (totalAmount: number, weights: number[]): number[] => {
  const totalCents = toCents(totalAmount);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (totalCents <= 0 || totalWeight <= 0) return weights.map(() => 0);

  const allocations = weights.map((weight, index) => {
    const exactCents = totalCents * weight / totalWeight;
    return { index, cents: Math.floor(exactCents), remainder: exactCents % 1 };
  });
  let centsLeft = totalCents - allocations.reduce((sum, allocation) => sum + allocation.cents, 0);

  [...allocations]
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index)
    .forEach((allocation) => {
      if (centsLeft <= 0) return;
      allocations[allocation.index].cents += 1;
      centsLeft -= 1;
    });

  return allocations.map(allocation => allocation.cents / 100);
};

export function getSplitProgress(
  userIds: string[],
  totalAmount: number,
  method: SplitMethod,
  values: Record<string, string>
): SplitProgress {
  const total = Math.max(0, totalAmount);
  const rawValues = userIds.map(userId => ({ userId, ...parseSplitValue(values[userId]) }));
  const allValuesValid = rawValues.every(item => item.isValid);

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
      isBalanced: allValuesValid && Math.abs(percentageTotal - 100) < 0.01,
      people,
    };
  }

  if (method === 'shares') {
    const totalShares = rawValues.reduce((sum, item) => sum + item.value, 0);
    const people = rawValues.map(item => ({
      userId: item.userId,
      amount: totalShares > 0 ? total * item.value / totalShares : 0,
    }));
    return {
      allocated: totalShares > 0 ? total : 0,
      remaining: totalShares > 0 ? 0 : total,
      isBalanced: allValuesValid && totalShares > 0,
      people,
    };
  }

  const allocated = rawValues.reduce((sum, item) => sum + item.value, 0);
  return {
    allocated,
    remaining: total - allocated,
    isBalanced: allValuesValid && Math.abs(total - allocated) < 0.01,
    people: rawValues.map(item => ({ userId: item.userId, amount: item.value })),
  };
}

export function calculateExpenseSplits(
  userIds: string[],
  totalAmount: number,
  method: SplitMethod,
  values: Record<string, string>
): SplitCalculationResult {
  if (userIds.length === 0) {
    return { splits: null, error: 'Please select at least one participant' };
  }

  const total = Math.max(0, totalAmount);
  const parsedValues = userIds.map(userId => ({ userId, ...parseSplitValue(values[userId]) }));
  if (parsedValues.some(item => !item.isValid)) {
    return { splits: null, error: 'Split values must be zero or greater' };
  }

  if (method === 'equal') {
    const amounts = allocateCentsByWeight(total, userIds.map(() => 1));
    return {
      splits: userIds.map((userId, index) => ({ userId, amount: amounts[index], splitType: 'equal' })),
    };
  }

  if (method === 'unequal') {
    const allocatedCents = parsedValues.reduce((sum, item) => sum + toCents(item.value), 0);
    const totalCents = toCents(total);
    if (allocatedCents !== totalCents) {
      return {
        splits: null,
        error: `Amounts must add up to $${total.toFixed(2)}. Current total: $${(allocatedCents / 100).toFixed(2)}`,
      };
    }
    return {
      splits: parsedValues.map(item => ({
        userId: item.userId,
        amount: toCents(item.value) / 100,
        splitType: 'exact' as const,
      })),
    };
  }

  if (method === 'percentage') {
    const percentageTotal = parsedValues.reduce((sum, item) => sum + item.value, 0);
    if (Math.abs(percentageTotal - 100) > 0.01) {
      return {
        splits: null,
        error: `Percentages must add up to 100%. Current total: ${percentageTotal.toFixed(1)}%`,
      };
    }
    const amounts = allocateCentsByWeight(total, parsedValues.map(item => item.value));
    return {
      splits: parsedValues.map((item, index) => ({
        userId: item.userId,
        amount: amounts[index],
        splitType: 'percentage',
        percentage: Math.round(item.value * 100) / 100,
      })),
    };
  }

  const totalShares = parsedValues.reduce((sum, item) => sum + item.value, 0);
  if (totalShares <= 0) {
    return { splits: null, error: 'Please enter at least one share' };
  }

  const positiveValues = parsedValues.filter(item => item.value > 0);
  const amounts = allocateCentsByWeight(total, positiveValues.map(item => item.value));
  return {
    splits: positiveValues
      .map((item, index) => ({
        userId: item.userId,
        amount: amounts[index],
        splitType: 'exact',
      })),
  };
}

export function getEvenSplitValues(userIds: string[], method: SplitMethod, totalAmount = 0): Record<string, string> {
  if (method === 'percentage') {
    if (userIds.length === 0) return {};

    const baseBasisPoints = Math.floor(10_000 / userIds.length);
    let remainingBasisPoints = 10_000 - baseBasisPoints * userIds.length;
    return Object.fromEntries(userIds.map(userId => {
      const basisPoints = baseBasisPoints + (remainingBasisPoints-- > 0 ? 1 : 0);
      return [userId, (basisPoints / 100).toFixed(2)];
    }));
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
