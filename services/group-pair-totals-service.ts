import { supabase } from '@/lib/supabase';

export type GroupPairTotal = {
  userA: string;
  userB: string;
  currency: string;
  /** Signed group-ledger component (user_a perspective). */
  groupAmount: number;
  /** Signed direct-ledger component (user_a perspective). */
  directAmount: number;
  /** Canonical debtor. */
  fromUserId: string;
  /** Canonical creditor. */
  toUserId: string;
  /** Absolute net (0 for settled-with-flows pairs). */
  amount: number;
};

type GroupPairTotalRow = {
  user_a: string;
  user_b: string;
  currency: string;
  group_amount: number;
  direct_amount: number;
  from_user_id: string;
  to_user_id: string;
  amount: number;
};

function mapRow(row: GroupPairTotalRow): GroupPairTotal {
  return {
    userA: row.user_a,
    userB: row.user_b,
    currency: row.currency,
    groupAmount: row.group_amount,
    directAmount: row.direct_amount,
    fromUserId: row.from_user_id,
    toUserId: row.to_user_id,
    amount: row.amount,
  };
}

export const groupPairTotalsService = {
  async getByGroup(groupId: string): Promise<GroupPairTotal[]> {
    const { data, error } = await supabase.rpc('get_group_pair_totals', {
      p_group_id: groupId,
    });
    if (error) throw error;
    return ((data ?? []) as GroupPairTotalRow[]).map(mapRow);
  },
};
