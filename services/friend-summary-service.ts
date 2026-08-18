import { supabase } from '@/lib/supabase';
import type { FriendRelationshipProjection } from '@/services/friend-detail-service';
import type { Expense, ExpenseSplit, Settlement, User } from '@/types/database';

export interface FriendSummary extends User {
  balance: number;
  recentExpenses?: Expense[];
  relationship?: FriendRelationshipProjection;
}

export interface FriendHomeSummary extends FriendSummary {
  relationship: FriendRelationshipProjection;
}

type FriendHomeExpenseRow = {
  id: string;
  group_id: string | null;
  description: string;
  amount: number;
  currency: string;
  paid_by: string;
  created_by: string | null;
  category: string | null;
  date: string;
  image_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type FriendHomeRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  avatar: string | null;
  push_token: string | null;
  is_active: boolean;
  created_at: string;
  balance: number;
  recent_expenses: FriendHomeExpenseRow[] | null;
  relationship: FriendRelationshipProjection;
};

function mapFriendHomeExpense(row: FriendHomeExpenseRow): Expense {
  return {
    id: row.id,
    groupId: row.group_id || undefined,
    description: row.description,
    amount: row.amount,
    currency: row.currency,
    paidBy: row.paid_by,
    createdBy: row.created_by || undefined,
    category: row.category || undefined,
    date: new Date(row.date).getTime(),
    imageUrl: row.image_url || undefined,
    notes: row.notes || undefined,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

function mapFriendHomeRow(row: FriendHomeRow): FriendHomeSummary {
  return {
    id: row.id,
    name: row.name,
    email: row.email || undefined,
    phone: row.phone || undefined,
    avatar: row.avatar || undefined,
    pushToken: row.push_token || undefined,
    isActive: row.is_active,
    createdAt: new Date(row.created_at).getTime(),
    balance: row.balance,
    relationship: row.relationship,
    recentExpenses: (row.recent_expenses || []).map(mapFriendHomeExpense),
  };
}

const SETTLED_BALANCE_THRESHOLD = 0.01;

function normalizeBalance(balance: number) {
  return Math.abs(balance) < SETTLED_BALANCE_THRESHOLD ? 0 : balance;
}

export function calculateFriendSummaryTotals(
  friends: Pick<FriendSummary, 'balance'>[]
): { totalOwed: number; totalOwing: number } {
  return friends.reduce(
    (totals, friend) => {
      if (friend.balance > 0.01) {
        totals.totalOwed += friend.balance;
      } else if (friend.balance < -0.01) {
        totals.totalOwing += Math.abs(friend.balance);
      }

      return totals;
    },
    { totalOwed: 0, totalOwing: 0 }
  );
}

export function buildFriendSummaries(
  currentUserId: string,
  friends: User[],
  expenses: Expense[],
  splits: ExpenseSplit[],
  settlements: Settlement[],
  recentLimit = 2
): FriendSummary[] {
  const friendIds = new Set(friends.map(friend => friend.id));
  const balances = new Map(friends.map(friend => [friend.id, 0]));
  const recentByFriend = new Map<string, Expense[]>();
  const splitsByExpenseId = new Map<string, ExpenseSplit[]>();

  for (const split of splits) {
    const expenseSplits = splitsByExpenseId.get(split.expenseId) ?? [];
    expenseSplits.push(split);
    splitsByExpenseId.set(split.expenseId, expenseSplits);
  }

  const balanceImpacts: { friendId: string; expense: Expense; amount: number }[] = [];

  for (const expense of expenses) {
    const expenseSplits = splitsByExpenseId.get(expense.id) ?? [];
    const currentUserSplit = expenseSplits.find(split => split.userId === currentUserId);

    if (!currentUserSplit) continue;

    if (expense.paidBy === currentUserId) {
      for (const split of expenseSplits) {
        if (!friendIds.has(split.userId)) continue;

        balances.set(split.userId, (balances.get(split.userId) ?? 0) + split.amount);
        balanceImpacts.push({
          friendId: split.userId,
          expense,
          amount: split.amount,
        });
      }
    } else if (friendIds.has(expense.paidBy)) {
      balances.set(expense.paidBy, (balances.get(expense.paidBy) ?? 0) - currentUserSplit.amount);
      balanceImpacts.push({
        friendId: expense.paidBy,
        expense,
        amount: -currentUserSplit.amount,
      });
    }
  }

  for (const settlement of settlements) {
    const isCurrentUserPayer = settlement.fromUserId === currentUserId;
    const friendId = isCurrentUserPayer ? settlement.toUserId : settlement.fromUserId;

    if (!friendIds.has(friendId)) continue;

    const amount = isCurrentUserPayer ? settlement.amount : -settlement.amount;
    balances.set(friendId, (balances.get(friendId) ?? 0) + amount);
  }

  for (const { friendId, expense, amount } of balanceImpacts) {
    const balance = normalizeBalance(balances.get(friendId) ?? 0);
    if (balance === 0) continue;
    if ((balance > 0 && amount <= 0) || (balance < 0 && amount >= 0)) continue;

    const expensesForFriend = recentByFriend.get(friendId) ?? [];
    expensesForFriend.push({ ...expense, amount: Math.abs(amount) });
    recentByFriend.set(friendId, expensesForFriend);
  }

  for (const expensesForFriend of recentByFriend.values()) {
    expensesForFriend.sort((a, b) => b.date - a.date);
  }

  return friends.map(friend => ({
    ...friend,
    balance: normalizeBalance(balances.get(friend.id) ?? 0),
    recentExpenses: (recentByFriend.get(friend.id) ?? []).slice(0, recentLimit),
  }));
}

export const friendSummaryService = {
  async getHomeSummaries(currentUserId: string): Promise<FriendHomeSummary[]> {
    const { data, error } = await supabase.rpc('get_friend_home_relationships');

    if (error) throw error;
    return ((data || []) as FriendHomeRow[]).map(mapFriendHomeRow);
  },
};
