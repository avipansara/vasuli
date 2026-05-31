import { supabase } from '@/lib/supabase';
import type { Expense, ExpenseSplit, Settlement } from '@/types/database';
import { expenseService } from './expense-service';

interface PairSettlementAllocationParams {
  currentUserId: string;
  friendId: string;
  amount: number;
  expenses: Expense[];
  splits: ExpenseSplit[];
  settlements: Settlement[];
}

type PairSettlementAllocation = Omit<Settlement, 'id' | 'createdAt' | 'currency' | 'date' | 'notes'>;

const SETTLED_BALANCE_THRESHOLD = 0.01;

function normalizeAmount(amount: number) {
  return Math.abs(amount) < SETTLED_BALANCE_THRESHOLD ? 0 : Number(amount.toFixed(2));
}

export function buildPairSettlementAllocations({
  currentUserId,
  friendId,
  amount,
  expenses,
  splits,
  settlements,
}: PairSettlementAllocationParams): PairSettlementAllocation[] {
  const splitsByExpenseId = new Map<string, ExpenseSplit[]>();
  const balancesByGroupId = new Map<string | undefined, number>();

  for (const split of splits) {
    const expenseSplits = splitsByExpenseId.get(split.expenseId) ?? [];
    expenseSplits.push(split);
    splitsByExpenseId.set(split.expenseId, expenseSplits);
  }

  for (const expense of expenses) {
    const expenseSplits = splitsByExpenseId.get(expense.id) ?? [];
    const currentUserSplit = expenseSplits.find(split => split.userId === currentUserId);
    const friendSplit = expenseSplits.find(split => split.userId === friendId);

    if (!currentUserSplit || !friendSplit) continue;

    const groupId = expense.groupId;
    const currentBalance = balancesByGroupId.get(groupId) ?? 0;

    if (expense.paidBy === currentUserId) {
      balancesByGroupId.set(groupId, currentBalance + friendSplit.amount);
    } else if (expense.paidBy === friendId) {
      balancesByGroupId.set(groupId, currentBalance - currentUserSplit.amount);
    }
  }

  for (const settlement of settlements) {
    const isPairSettlement =
      (settlement.fromUserId === currentUserId && settlement.toUserId === friendId) ||
      (settlement.fromUserId === friendId && settlement.toUserId === currentUserId);

    if (!isPairSettlement) continue;

    const groupId = settlement.groupId;
    const currentBalance = balancesByGroupId.get(groupId) ?? 0;
    const amountDelta = settlement.fromUserId === currentUserId ? settlement.amount : -settlement.amount;
    balancesByGroupId.set(groupId, currentBalance + amountDelta);
  }

  const totalBalance = normalizeAmount(
    Array.from(balancesByGroupId.values()).reduce((total, balance) => total + balance, 0)
  );
  if (totalBalance === 0) return [];

  const settlesPositiveBalance = totalBalance > 0;
  let remaining = Math.abs(amount);
  const allocations: PairSettlementAllocation[] = [];

  for (const [groupId, rawBalance] of balancesByGroupId) {
    const balance = normalizeAmount(rawBalance);
    if (balance === 0) continue;
    if (settlesPositiveBalance !== (balance > 0)) continue;
    if (remaining < SETTLED_BALANCE_THRESHOLD) break;

    const allocationAmount = normalizeAmount(Math.min(Math.abs(balance), remaining));
    if (allocationAmount === 0) continue;

    allocations.push({
      groupId,
      fromUserId: settlesPositiveBalance ? friendId : currentUserId,
      toUserId: settlesPositiveBalance ? currentUserId : friendId,
      amount: allocationAmount,
    });
    remaining = normalizeAmount(remaining - allocationAmount);
  }

  return allocations;
}

export const settlementService = {
  async create(settlement: Omit<Settlement, 'id' | 'createdAt'>): Promise<Settlement> {
    const createdAt = new Date().toISOString();

    const { data, error } = await supabase
      .from('settlements')
      .insert({
        group_id: settlement.groupId,
        from_user_id: settlement.fromUserId,
        to_user_id: settlement.toUserId,
        amount: settlement.amount,
        currency: settlement.currency,
        date: new Date(settlement.date).toISOString(),
        notes: settlement.notes || null,
        created_at: createdAt,
      })
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      groupId: data.group_id,
      fromUserId: data.from_user_id,
      toUserId: data.to_user_id,
      amount: data.amount,
      currency: data.currency,
      date: new Date(data.date).getTime(),
      notes: data.notes || undefined,
      createdAt: new Date(data.created_at).getTime(),
    };
  },

  async getUserSettlements(userId: string): Promise<Settlement[]> {
    const { data, error } = await supabase
      .from('settlements')
      .select('*')
      .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map(r => ({
      id: r.id,
      groupId: r.group_id || undefined,
      fromUserId: r.from_user_id,
      toUserId: r.to_user_id,
      amount: r.amount,
      currency: r.currency,
      date: new Date(r.date).getTime(),
      notes: r.notes || undefined,
      createdAt: new Date(r.created_at).getTime(),
    }));
  },

  async getByGroup(groupId: string): Promise<Settlement[]> {
    const { data, error } = await supabase
      .from('settlements')
      .select('*')
      .eq('group_id', groupId)
      .order('date', { ascending: false });

    if (error) throw error;

    return (data || []).map(r => ({
      id: r.id,
      groupId: r.group_id,
      fromUserId: r.from_user_id,
      toUserId: r.to_user_id,
      amount: r.amount,
      currency: r.currency,
      date: new Date(r.date).getTime(),
      notes: r.notes || undefined,
      createdAt: new Date(r.created_at).getTime(),
    }));
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('settlements')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  async createPairSettlements(params: {
    currentUserId: string;
    friendId: string;
    amount: number;
    currency: string;
    date: number;
  }): Promise<Settlement[]> {
    const [expenses, existingSettlements] = await Promise.all([
      expenseService.getUserExpenses(params.currentUserId),
      settlementService.getUserSettlements(params.currentUserId),
    ]);
    const splits = await expenseService.getSplitsForExpenses(expenses.map(expense => expense.id));
    const allocations = buildPairSettlementAllocations({
      currentUserId: params.currentUserId,
      friendId: params.friendId,
      amount: params.amount,
      expenses,
      splits,
      settlements: existingSettlements,
    });

    const settlements: Settlement[] = [];
    for (const allocation of allocations) {
      settlements.push(await settlementService.create({
        ...allocation,
        currency: params.currency,
        date: params.date,
      }));
    }

    return settlements;
  },
};
