import type { Expense, ExpenseSplit, Settlement, SettlementScopeTransfer } from '@/types/database';

export type BilateralLine = {
  fromUserId: string;
  toUserId: string;
  /** Positive amount the debtor owes the creditor. */
  amount: number;
  currency: string;
};

type SplitLike = Pick<ExpenseSplit, 'expenseId' | 'userId' | 'amount'>;
type ExpenseLike = Pick<Expense, 'id' | 'paidBy' | 'currency'>;
type SettlementLike = Pick<Settlement, 'fromUserId' | 'toUserId' | 'amount' | 'currency'>;
type TransferLike = Pick<SettlementScopeTransfer, 'fromUserId' | 'toUserId' | 'currency' | 'signedGroupBalanceDelta' | 'isReversal'>;

const CENT = 0.01;

/**
 * All-pairs bilateral debts for one group, one line per (debtor, creditor,
 * currency) triple with a nonzero balance. Matches the server bilateral
 * convention (actor_balance == displayed scope.amount): only flows between
 * the two people count — third-party-paid expenses contribute nothing.
 *
 * Sign convention per ordered pair (A, B), amount from A's perspective:
 *   expenses:    paid_by=A -> +B_split / paid_by=B -> -A_split
 *   settlements: from=B -> -amount / to=B -> +amount
 *   transfers:   from=B -> -delta / to=B -> +delta
 * Negative flips into a canonical debtor->creditor line.
 */
export function computeBilateralLines(input: {
  expenses: (ExpenseLike & { splits: SplitLike[] })[];
  settlements: SettlementLike[];
  scopeTransfers?: TransferLike[];
  memberUserIds: string[];
}): BilateralLine[] {
  const { expenses, settlements, scopeTransfers = [], memberUserIds } = input;
  const members = [...new Set(memberUserIds)];
  const lines: BilateralLine[] = [];

  for (let i = 0; i < members.length; i += 1) {
    for (let j = i + 1; j < members.length; j += 1) {
      const [a, b] = [members[i], members[j]];
      const perCurrency = new Map<string, number>();

      for (const expense of expenses) {
        if (expense.paidBy !== a && expense.paidBy !== b) continue;
        const aSplit = expense.splits.find(split => split.userId === a)?.amount ?? 0;
        const bSplit = expense.splits.find(split => split.userId === b)?.amount ?? 0;
        const delta = expense.paidBy === a ? bSplit : -aSplit;
        if (delta !== 0) {
          perCurrency.set(expense.currency, (perCurrency.get(expense.currency) ?? 0) + delta);
        }
      }

      for (const settlement of settlements) {
        const isAB = settlement.fromUserId === a && settlement.toUserId === b;
        const isBA = settlement.fromUserId === b && settlement.toUserId === a;
        if (!isAB && !isBA) continue;
        // From A's perspective: B paid out (-), B received (+).
        const delta = settlement.fromUserId === b ? -settlement.amount : settlement.amount;
        perCurrency.set(settlement.currency, (perCurrency.get(settlement.currency) ?? 0) + delta);
      }

      for (const transfer of scopeTransfers) {
        if (transfer.isReversal) continue;
        const isAB = transfer.fromUserId === a && transfer.toUserId === b;
        const isBA = transfer.fromUserId === b && transfer.toUserId === a;
        if (!isAB && !isBA) continue;
        const delta = transfer.fromUserId === b
          ? -transfer.signedGroupBalanceDelta
          : transfer.signedGroupBalanceDelta;
        perCurrency.set(transfer.currency, (perCurrency.get(transfer.currency) ?? 0) + delta);
      }

      for (const [currency, signed] of perCurrency) {
        const amount = Math.abs(signed) < CENT ? 0 : Number(Math.abs(signed).toFixed(2));
        if (amount === 0) continue;
        // `signed` is A's perspective (positive = A is owed): negative means A owes B.
        lines.push(signed < 0
          ? { fromUserId: a, toUserId: b, amount, currency }
          : { fromUserId: b, toUserId: a, amount, currency });
      }
    }
  }

  return lines.sort((x, y) =>
    x.fromUserId.localeCompare(y.fromUserId)
    || x.toUserId.localeCompare(y.toUserId)
    || x.currency.localeCompare(y.currency),
  );
}

/** Lines where the given member is the debtor (they pay). */
export function linesOwedBy(lines: BilateralLine[], memberUserId: string): BilateralLine[] {
  return lines.filter(line => line.fromUserId === memberUserId);
}

/** Lines where the given member is the creditor (they receive). */
export function linesOwedTo(lines: BilateralLine[], memberUserId: string): BilateralLine[] {
  return lines.filter(line => line.toUserId === memberUserId);
}
