import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { calculateGroupBalances } from '@/services/group-balance';

// Ticket 09: server transfer-orientation agreement.
//
// The dev-proven shape: reviewer paid two group expenses ($31 + $10, even
// splits), one group cash payment friend -> reviewer ($36), one
// from-user-oriented transfer row (delta -15.50, from friend -> reviewer),
// all in one group. The group ledger engine below is the client side of the
// agreement: participant-symmetric application (from += delta,
// to -= delta) reads reviewer 0 / friend 0. The server side of the same
// agreement is proven by
// supabase/tests/settlement_transfer_orientation_regressions.sql, which
// asserts the identical shape through get_friend_home_relationships,
// get_groups_home_summaries, and get_group_pair_totals (0/0, not -31),
// reversal neutrality, and simulated-backfill parity.

const reviewerId = 't09-reviewer';
const friendId = 't09-friend';

function decoyTransfer() {
  return {
    id: 'transfer-decoy',
    operationId: 'operation-decoy',
    groupId: 'group-decoy',
    fromUserId: friendId,
    toUserId: reviewerId,
    currency: 'USD',
    signedGroupBalanceDelta: -15.5,
    createdAt: 3,
  };
}

describe('transfer orientation agreement (ticket 09)', () => {
  it('reads the from-user-oriented decoy row as settled for both parties', () => {
    const balances = calculateGroupBalances(
      [
        { id: 'dinner', groupId: 'group-decoy', description: 'Dinner', amount: 31, currency: 'USD', paidBy: reviewerId, date: 1, createdAt: 1, updatedAt: 1 },
        { id: 'taxi', groupId: 'group-decoy', description: 'Taxi', amount: 10, currency: 'USD', paidBy: reviewerId, date: 2, createdAt: 2, updatedAt: 2 },
      ],
      [
        { id: 'split-dinner-reviewer', expenseId: 'dinner', userId: reviewerId, amount: 15.5, splitType: 'equal' },
        { id: 'split-dinner-friend', expenseId: 'dinner', userId: friendId, amount: 15.5, splitType: 'equal' },
        { id: 'split-taxi-reviewer', expenseId: 'taxi', userId: reviewerId, amount: 5, splitType: 'equal' },
        { id: 'split-taxi-friend', expenseId: 'taxi', userId: friendId, amount: 5, splitType: 'equal' },
      ],
      [
        {
          id: 'group-cash',
          groupId: 'group-decoy',
          fromUserId: friendId,
          toUserId: reviewerId,
          amount: 36,
          currency: 'USD',
          date: 4,
          createdAt: 4,
        },
      ],
      [decoyTransfer()],
    );

    expect(balances.get(reviewerId)).toBe(0);
    expect(balances.get(friendId)).toBe(0);
  });

  it('keeps a transfer-free pair exactly where it is', () => {
    const balances = calculateGroupBalances(
      [
        { id: 'control', groupId: 'group-decoy', description: 'Control', amount: 20, currency: 'USD', paidBy: reviewerId, date: 1, createdAt: 1, updatedAt: 1 },
      ],
      [
        { id: 'split-control-reviewer', expenseId: 'control', userId: reviewerId, amount: 10, splitType: 'equal' },
        { id: 'split-control-third', expenseId: 'control', userId: 't09-third', amount: 10, splitType: 'equal' },
      ],
      [],
      [],
    );

    expect(balances.get(reviewerId)).toBe(10);
    expect(balances.get('t09-third')).toBe(-10);
  });

  it('documents the shared from-user orientation in the group balance engine', () => {
    const groupBalance = readFileSync(
      new URL('./group-balance.ts', import.meta.url),
      'utf8',
    );
    const balanceUtils = readFileSync(
      new URL('./balance-utils.ts', import.meta.url),
      'utf8',
    );
    const transferType = readFileSync(
      new URL('../types/database.ts', import.meta.url),
      'utf8',
    );
    const settlementService = readFileSync(
      new URL('./settlement-service.ts', import.meta.url),
      'utf8',
    );

    for (const source of [groupBalance, balanceUtils, transferType, settlementService]) {
      expect(source).toContain('signedGroupBalanceDelta is the change to the transfer');
      expect(source).not.toContain("change to the transfer actor's group");
      expect(source).not.toContain('Change to the current user');
      expect(source).not.toContain('change to the current user');
    }
  });

  it('repairs the home/groups readers to the shared orientation with backfill exclusion', () => {
    const migration = readFileSync(
      new URL(
        '../supabase/migrations/20260906030000_fix_transfer_orientation_and_backfill_exclusion.sql',
        import.meta.url,
      ),
      'utf8',
    );

    // Participant-based application (reverts the 19010000 actor regression).
    // The operation.actor_user_id phrasing remains for pair attribution and
    // in quoted anchors; the delta orientation is what changes.
    expect(migration).toContain('transfer.from_user_id = app_user_id');
    expect(migration).toContain('THEN transfer.signed_group_balance_delta');
    expect(migration).toContain('ELSE -transfer.signed_group_balance_delta');
    // Converted transfers are excludable by readers (marker-aware, operation
    // granularity so reversal rows of converted operations stay excluded too).
    expect(migration).toContain('backfilled_transfer_id');
    expect(migration).toContain('NOT converted_transfer.is_reversal');
    // Touched readers: friend home, groups home, pair totals, commit
    // validation terms, scope-transfer read RPCs, validator priors.
    expect(migration).toContain("p.proname = 'get_friend_home_relationships'");
    expect(migration).toContain("p.proname = 'get_groups_home_summaries'");
    expect(migration).toContain("p.proname = 'get_group_pair_totals'");
    expect(migration).toContain("p.proname = 'commit_settlement_operation'");
    expect(migration).toContain("p.proname = 'validate_settlement_scope_transfer'");
    expect(migration).toContain('get_friend_scope_transfers');
    expect(migration).toContain('get_group_scope_transfers');
    // Additive only: anchored DO-blocks fail loudly, no grant broadening,
    // no signature/auth changes, no history rewrites.
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS');
    expect(migration).toContain('CREATE INDEX IF NOT EXISTS');
    expect(migration).toContain('was not found');
    expect(migration).not.toContain('DROP TABLE');
    expect(migration).not.toContain('DROP FUNCTION');
    expect(migration).not.toContain('GRANT EXECUTE');
    expect(migration).not.toContain('UPDATE public.settlement_scope_transfers');
    expect(migration).not.toContain('DELETE FROM public.settlement_scope_transfers');
  });
});
