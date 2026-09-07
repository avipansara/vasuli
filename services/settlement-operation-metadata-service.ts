import { supabase } from '@/lib/supabase';
import type { SettlementOperationStatusRecord } from './settlement-operation-projection';

type OperationMetadataRow = {
  operation_id: string;
  status: 'committed' | 'reversed';
  created_at: string;
  reversed_at?: string | null;
  requested_payment_amount?: number | null;
  currency?: string | null;
  actor_user_id?: string | null;
  friend_user_id?: string | null;
  group_id?: string | null;
  local_payment_amount?: number | null;
  local_date?: string | null;
  local_from_user_id?: string | null;
  local_to_user_id?: string | null;
  original_date?: string | null;
  original_from_user_id?: string | null;
  original_to_user_id?: string | null;
};

function mapRow(row: OperationMetadataRow, includeParticipants: boolean): SettlementOperationStatusRecord {
  return {
    operationId: row.operation_id,
    status: row.status === 'reversed' ? 'reversed' : 'committed',
    createdAt: new Date(row.created_at).getTime(),
    ...(row.reversed_at ? { reversedAt: new Date(row.reversed_at).getTime() } : {}),
    ...(typeof row.requested_payment_amount === 'number'
      ? { requestedPaymentAmount: row.requested_payment_amount }
      : {}),
    ...(row.currency ? { currency: row.currency } : {}),
    ...(row.original_date ? { originalDate: new Date(row.original_date).getTime() } : {}),
    ...(includeParticipants && row.original_from_user_id && row.original_to_user_id
      ? { fromUserId: row.original_from_user_id, toUserId: row.original_to_user_id }
      : {}),
    ...(includeParticipants && !row.original_from_user_id && !row.original_to_user_id
      && row.actor_user_id && row.friend_user_id
      ? { fromUserId: row.actor_user_id, toUserId: row.friend_user_id }
      : {}),
    ...(!includeParticipants && row.group_id ? { groupId: row.group_id } : {}),
    ...(typeof row.local_payment_amount === 'number' ? { localCashAmount: row.local_payment_amount } : {}),
    ...(row.local_date ? { localDate: new Date(row.local_date).getTime() } : {}),
    ...(!includeParticipants && row.local_from_user_id && row.local_to_user_id
      ? { localFromUserId: row.local_from_user_id, localToUserId: row.local_to_user_id }
      : {}),
  };
}

export const settlementOperationMetadataService = {
  async getByFriend(friendId: string): Promise<SettlementOperationStatusRecord[]> {
    const { data, error } = await supabase.rpc('get_friend_settlement_operations', {
      p_friend_id: friendId,
    });
    if (error) throw error;
    return ((data ?? []) as OperationMetadataRow[]).map(row => mapRow(row, true));
  },

  async getByGroup(groupId: string): Promise<SettlementOperationStatusRecord[]> {
    const { data, error } = await supabase.rpc('get_group_settlement_operations', {
      p_group_id: groupId,
    });
    if (error) throw error;
    // Group readers intentionally receive lifecycle metadata only. In
    // particular, this response never contains an all-balances cash total.
    return ((data ?? []) as OperationMetadataRow[]).map(row => mapRow(row, false));
  },
};
