import { supabase } from '@/lib/supabase';
import type { SettlementCancellation } from '@/types/database';

// Task 4 cancellation read surface. The row shape mirrors
// `SettlementScopeTransfer` minus participants and signed delta: a
// cancellation names the cleared scope, amount, and immutable signed effect. This is an alias
// for the canonical `SettlementCancellation` type in `types/database.ts`
// (Task 5 unification); the name is kept for existing import sites.
export type SettlementCancellationRecord = SettlementCancellation;

type CancellationRpcRow = {
  id: string;
  operation_id: string;
  group_id: string;
  amount: number;
  signed_group_balance_delta?: number;
  currency: string;
  note: string | null;
  is_reversal?: boolean;
  created_at: string;
  actor_user_id?: string | null;
  friend_user_id?: string | null;
};

function mapCancellation(row: CancellationRpcRow): SettlementCancellationRecord {
  return {
    id: row.id,
    operationId: row.operation_id,
    groupId: row.group_id,
    amount: row.amount,
    ...(row.signed_group_balance_delta === undefined ? {} : { signedGroupBalanceDelta: row.signed_group_balance_delta }),
    currency: row.currency,
    note: row.note || undefined,
    isReversal: row.is_reversal ?? false,
    createdAt: new Date(row.created_at).getTime(),
    // Operation-pair attribution for client pair scoping (fix round 1).
    // Spread conditionally so rows predating the columns keep the legacy
    // shape exactly.
    ...(row.actor_user_id ? { actorUserId: row.actor_user_id } : {}),
    ...(row.friend_user_id ? { friendUserId: row.friend_user_id } : {}),
  };
}

export const settlementCancellationService = {
  async getByFriend(friendId: string): Promise<SettlementCancellationRecord[]> {
    const { data, error } = await supabase.rpc('get_friend_cancellations', {
      p_friend_id: friendId,
    });
    if (error) throw error;
    return ((data ?? []) as CancellationRpcRow[]).map(mapCancellation);
  },

  async getByGroup(groupId: string): Promise<SettlementCancellationRecord[]> {
    const { data, error } = await supabase.rpc('get_group_cancellations', {
      p_group_id: groupId,
    });
    if (error) throw error;
    return ((data ?? []) as CancellationRpcRow[]).map(mapCancellation);
  },
};
