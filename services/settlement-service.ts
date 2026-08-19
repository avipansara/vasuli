import { supabase } from '@/lib/supabase';
import type { Settlement } from '@/types/database';
import { expenseService } from './expense-service';
import type {
  CombinedSettlementCommitRequest,
  CombinedSettlementReceipt,
} from './combined-settlement-service';
import { mapCombinedSettlementError } from './combined-settlement-errors';

export type SettlementOperationReversal = {
  operationId: string;
  status: 'reversed';
  reversedAt: number;
  reused: boolean;
};

export const settlementService = {
  async commit(request: CombinedSettlementCommitRequest): Promise<CombinedSettlementReceipt> {
    const { data, error } = request.amount === 0
      ? await supabase.rpc('commit_zero_net_settlement_operation', {
        p_payment_intent_id: request.paymentIntentId,
        p_friend_id: request.friendId,
        p_currency: request.currency,
        p_date: new Date(request.date).toISOString(),
        p_expected_balance: request.expectedBalance,
        p_transfers: request.transfers ?? [],
      })
      : await supabase.rpc('commit_settlement_operation', {
        p_payment_intent_id: request.paymentIntentId,
        p_friend_id: request.friendId,
        p_group_id: request.groupId ?? null,
        p_mode: request.mode ?? 'all_balances',
        p_amount: request.amount,
        p_currency: request.currency,
        p_date: new Date(request.date).toISOString(),
        p_expected_balance: request.expectedBalance,
        p_allocations: request.allocations,
        p_transfers: request.transfers ?? [],
      });

    if (error) {
      console.error('[Settlement][commit] RPC failed', {
        rpc: request.amount === 0 ? 'commit_zero_net_settlement_operation' : 'commit_settlement_operation',
        paymentIntentSuffix: request.paymentIntentId.slice(-8),
        friendId: request.friendId,
        amount: request.amount,
        currency: request.currency,
        mode: request.mode ?? 'all_balances',
        groupId: request.groupId ?? null,
        expectedBalance: request.expectedBalance,
        allocationCount: request.allocations.length,
        transferCount: request.transfers?.length ?? 0,
        error: {
          code: 'code' in error ? error.code : undefined,
          message: 'message' in error ? error.message : String(error),
          details: 'details' in error ? error.details : undefined,
          hint: 'hint' in error ? error.hint : undefined,
        },
      });
      throw mapCombinedSettlementError(error);
    }

    return mapCombinedSettlementReceipt(data);
  },

  async reverse(operationId: string, expectedBalance: number): Promise<SettlementOperationReversal> {
    const { data, error } = await supabase.rpc('reverse_settlement_operation', {
      p_operation_id: operationId,
      p_expected_balance: expectedBalance,
    });

    if (error) {
      console.error('[Settlement][reverse] RPC failed', {
        operationId,
        expectedBalance,
        error: {
          code: 'code' in error ? error.code : undefined,
          message: 'message' in error ? error.message : String(error),
          details: 'details' in error ? error.details : undefined,
          hint: 'hint' in error ? error.hint : undefined,
        },
      });
      throw mapCombinedSettlementError(error);
    }
    return mapSettlementOperationReversal(data);
  },

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
      operationId: data.operation_id || undefined,
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
      operationId: r.operation_id || undefined,
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
      operationId: r.operation_id || undefined,
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

  async getByGroups(groupIds: string[]): Promise<Settlement[]> {
    const uniqueGroupIds = [...new Set(groupIds)].filter(Boolean);
    if (uniqueGroupIds.length === 0) return [];

    const { data, error } = await supabase
      .from('settlements')
      .select('*')
      .in('group_id', uniqueGroupIds)
      .order('date', { ascending: false });

    if (error) throw error;

    return (data || []).map(r => ({
      id: r.id,
      operationId: r.operation_id || undefined,
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

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('settlements')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

};

function mapCombinedSettlementReceipt(data: unknown): CombinedSettlementReceipt {
  if (!data || typeof data !== 'object') {
    throw new Error('Combined settlement commit returned an invalid receipt.');
  }

  const receipt = data as {
    paymentIntentId?: unknown;
    reused?: unknown;
    committedAt?: unknown;
    totalAmount?: unknown;
    currency?: unknown;
    direction?: unknown;
    settlements?: unknown;
    operationId?: unknown;
    mode?: unknown;
    affectedGroupIds?: unknown;
    transfers?: unknown;
  };

  if (
    typeof receipt.paymentIntentId !== 'string'
    || typeof receipt.reused !== 'boolean'
    || typeof receipt.committedAt !== 'string'
    || typeof receipt.totalAmount !== 'number'
    || typeof receipt.currency !== 'string'
    || (receipt.direction !== 'you_paid_friend' && receipt.direction !== 'friend_paid_you')
    || !Array.isArray(receipt.settlements)
  ) {
    throw new Error('Combined settlement commit returned an invalid receipt.');
  }

  return {
    paymentIntentId: receipt.paymentIntentId,
    reused: receipt.reused,
    committedAt: new Date(receipt.committedAt).getTime(),
    totalAmount: receipt.totalAmount,
    currency: receipt.currency,
    direction: receipt.direction,
    settlements: receipt.settlements.map(mapSettlementReceipt),
    operationId: typeof receipt.operationId === 'string' ? receipt.operationId : undefined,
    mode: receipt.mode === 'group' ? 'group' : 'all_balances',
    affectedGroupIds: Array.isArray(receipt.affectedGroupIds)
      ? receipt.affectedGroupIds.filter((value): value is string => typeof value === 'string')
      : [...new Set(receipt.settlements.flatMap(settlement => settlement.groupId ? [settlement.groupId] : []))],
    transfers: Array.isArray(receipt.transfers)
      ? receipt.transfers.map(mapSettlementScopeTransfer)
      : [],
  };
}

function mapSettlementOperationReversal(data: unknown): SettlementOperationReversal {
  if (!data || typeof data !== 'object') {
    throw new Error('Settlement reversal returned an invalid receipt.');
  }

  const receipt = data as Record<string, unknown>;
  const reversedAt = typeof receipt.reversedAt === 'string'
    ? new Date(receipt.reversedAt).getTime()
    : Number.NaN;
  if (
    typeof receipt.operationId !== 'string'
    || receipt.status !== 'reversed'
    || typeof receipt.reversedAt !== 'string'
    || !Number.isFinite(reversedAt)
    || typeof receipt.reused !== 'boolean'
  ) {
    throw new Error('Settlement reversal returned an invalid receipt.');
  }

  return {
    operationId: receipt.operationId,
    status: 'reversed',
    reversedAt,
    reused: receipt.reused,
  };
}

function mapSettlementScopeTransfer(value: unknown): import('./combined-settlement-service').SettlementScopeTransfer {
  if (!value || typeof value !== 'object') {
    throw new Error('Settlement operation returned an invalid scope transfer.');
  }

  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== 'string'
    || typeof row.operationId !== 'string'
    || typeof row.groupId !== 'string'
    || typeof row.fromUserId !== 'string'
    || typeof row.toUserId !== 'string'
    || typeof row.currency !== 'string'
    || typeof row.signedGroupBalanceDelta !== 'number'
    || typeof row.createdAt !== 'string'
  ) {
    throw new Error('Settlement operation returned an invalid scope transfer.');
  }

  return {
    id: row.id,
    operationId: row.operationId,
    groupId: row.groupId,
    fromUserId: row.fromUserId,
    toUserId: row.toUserId,
    currency: row.currency,
    signedGroupBalanceDelta: row.signedGroupBalanceDelta,
    note: typeof row.note === 'string' ? row.note : undefined,
    isReversal: row.isReversal === true,
    createdAt: new Date(row.createdAt).getTime(),
  };
}

function mapSettlementReceipt(value: unknown): Settlement {
  if (!value || typeof value !== 'object') {
    throw new Error('Combined settlement commit returned an invalid settlement.');
  }

  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== 'string'
    || (row.groupId !== null && row.groupId !== undefined && typeof row.groupId !== 'string')
    || typeof row.fromUserId !== 'string'
    || typeof row.toUserId !== 'string'
    || typeof row.amount !== 'number'
    || typeof row.currency !== 'string'
    || typeof row.date !== 'string'
    || typeof row.createdAt !== 'string'
  ) {
    throw new Error('Combined settlement commit returned an invalid settlement.');
  }

  return {
    id: row.id,
    operationId: typeof row.operationId === 'string' ? row.operationId : undefined,
    groupId: typeof row.groupId === 'string' ? row.groupId : undefined,
    fromUserId: row.fromUserId,
    toUserId: row.toUserId,
    amount: row.amount,
    currency: row.currency,
    date: new Date(row.date).getTime(),
    notes: typeof row.notes === 'string' ? row.notes : undefined,
    createdAt: new Date(row.createdAt).getTime(),
  };
}
