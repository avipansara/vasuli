import { supabase } from '@/lib/supabase';
import type { SettlementScopeTransfer } from '@/types/database';

type ScopeTransferRpcRow = {
  id: string;
  operation_id: string;
  group_id: string;
  from_user_id: string;
  to_user_id: string;
  currency: string;
  signed_group_balance_delta: number;
  note: string | null;
  created_at: string;
};

function mapScopeTransfer(row: ScopeTransferRpcRow): SettlementScopeTransfer {
  return {
    id: row.id,
    operationId: row.operation_id,
    groupId: row.group_id,
    fromUserId: row.from_user_id,
    toUserId: row.to_user_id,
    currency: row.currency,
    signedGroupBalanceDelta: row.signed_group_balance_delta,
    note: row.note || undefined,
    createdAt: new Date(row.created_at).getTime(),
  };
}

export const scopeTransferService = {
  async getByFriend(friendId: string): Promise<SettlementScopeTransfer[]> {
    const { data, error } = await supabase.rpc('get_friend_scope_transfers', {
      p_friend_id: friendId,
    });
    if (error) throw error;
    return ((data ?? []) as ScopeTransferRpcRow[]).map(mapScopeTransfer);
  },

  async getByGroup(groupId: string): Promise<SettlementScopeTransfer[]> {
    const { data, error } = await supabase.rpc('get_group_scope_transfers', {
      p_group_id: groupId,
    });
    if (error) throw error;
    return ((data ?? []) as ScopeTransferRpcRow[]).map(mapScopeTransfer);
  },
};
