import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Database } from '../types/supabase';

type CancellationRow =
  Database['public']['Tables']['settlement_cancellations']['Row'];

const readMigration = (name: string) => readFileSync(
  new URL(`../supabase/migrations/${name}`, import.meta.url),
  'utf8',
);

describe('settlement RPC migration contracts', () => {
  it('keeps group settlements activity-only in the Friend detail read model', () => {
    const migration = readMigration('20260819060000_fix_friend_detail_group_settlement_activity.sql');

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.get_friend_detail_read_model(p_friend_id uuid)');
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain('SET search_path = public, private, pg_temp');
    expect(migration).toContain('pair_settlements AS (');
    expect(migration).toContain('WHERE s.group_id IS NULL');
    expect(migration).toContain('group_settlements AS (');
    expect(migration).toContain('WHERE s.group_id IS NOT NULL');
    expect(migration).toContain("'groupSettlements', gsp.value");
    expect(migration).toContain("'operationId', s.operation_id");

    const pairSettlements = migration.match(/pair_settlements AS \(([\s\S]*?)\n    \),\n    group_settlements AS/)?.[1] ?? '';
    expect(pairSettlements).toContain('WHERE s.group_id IS NULL');
    expect(pairSettlements).not.toContain('s.group_id IS NOT NULL');
  });

  it('uses the physical request_fingerprint column for positive operation inserts', () => {
    const migration = readMigration('20260819050000_fix_positive_settlement_fingerprint_column.sql');
    const insert = migration.match(/INSERT INTO public\.settlement_operations \([\s\S]*?\) VALUES \(/)?.[0] ?? '';

    expect(insert).toContain('request_fingerprint');
    expect(insert).not.toContain('new_request_fingerprint\n');
    expect(migration).toContain('new_request_fingerprint := md5(jsonb_build_object(');
    expect(migration).toContain('ON CONFLICT (actor_user_id, payment_intent_id) DO NOTHING');
    expect(migration).toContain('SET request_fingerprint = new_request_fingerprint');
    expect(migration).toContain('SET search_path = public, private, pg_temp');
  });

  it('keeps zero-net idempotency explicit and privilege-restricted', () => {
    const migration = readMigration('20260819030000_unify_zero_net_commit_semantics.sql');

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.commit_zero_net_settlement_operation(');
    expect(migration).toContain('new_request_fingerprint := md5(jsonb_build_object(');
    expect(migration).toContain('SET request_fingerprint = new_request_fingerprint');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.commit_zero_net_settlement_operation(');
    expect(migration).toContain(') TO authenticated;');
    expect(migration).not.toMatch(/pg_get_functiondef|EXECUTE\s*\(/i);
  });

  it('keeps reversal explicit and retires only the legacy positive functions', () => {
    const migration = readMigration('20260819040000_align_reversal_and_retire_legacy_commit_path.sql');

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.reverse_settlement_operation(');
    expect(migration).toContain('t.signed_group_balance_delta,');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.reverse_settlement_operation(UUID, NUMERIC)');
    expect(migration).toContain('DROP FUNCTION IF EXISTS public.commit_settlement_operation_internal(');
    expect(migration).toContain('DROP FUNCTION IF EXISTS public.commit_combined_settlement(');
    expect(migration).not.toContain('DROP TABLE');
    expect(migration).not.toContain('DROP FUNCTION IF EXISTS public.reverse_settlement_operation');
  });

  it('computes friend group balances bilaterally (pair-paid expenses only)', () => {
    const migration = readMigration('20260904220000_bilateral_pair_group_balances.sql');

    expect(migration).toContain("p.proname = 'get_friend_home_relationships_legacy'");
    // DO-block style (repo precedent): guards fail loudly, settings inherited untouched
    expect(migration).toContain('EXECUTE function_definition');
    expect(migration).toContain('Could not update legacy group_impacts to bilateral');
    // pair pattern: only expenses paid by one of the pair move the pair balance
    expect(migration).toContain('e.paid_by IN (operation_row.actor_user_id, operation_row.friend_user_id)');
    expect(migration).toContain('e.paid_by IN (app_user_id, p_friend_id)');
    // pair settlements only on both write paths
    expect(migration).toContain('s.from_user_id = operation_row.actor_user_id AND s.to_user_id = operation_row.friend_user_id');
    expect(migration).toContain('s.from_user_id = app_user_id AND s.to_user_id = p_friend_id');
    expect(migration).not.toContain('DROP TABLE');
  });

  it('validates commits, transfers and reversals against the same bilateral base', () => {
    const migration = readMigration('20260904220000_bilateral_pair_group_balances.sql');

    expect(migration).toContain('Could not update commit current_balance to bilateral');
    expect(migration).toContain('Could not update scope-transfer validation base to bilateral');
    expect(migration).toContain('Could not add viewer_split join to scope-transfer validation');
    expect(migration).toContain('Could not update reversal current_balance to bilateral');
    expect(migration).toContain("p.proname = 'validate_settlement_scope_transfer'");
    expect(migration).toContain("p.proname = 'reverse_settlement_operation'");
    expect(migration).not.toContain('DROP FUNCTION IF EXISTS public.reverse_settlement_operation');
  });

  it('exposes combined pair totals with member-only access', () => {
    const migration = readMigration('20260904230000_group_pair_combined_totals.sql');

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.get_group_pair_totals(p_group_id UUID)');
    expect(migration).toContain('SET search_path = public, private, pg_temp');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.get_group_pair_totals(UUID) FROM PUBLIC, anon;');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.get_group_pair_totals(UUID) TO authenticated;');
    expect(migration).not.toContain('DROP TABLE');
  });

  it('qualifies the zero-net receipt variable so new and reused receipts succeed', () => {
    const migration = readMigration('20260906000000_fix_zero_net_receipt_and_reversal_direction.sql');

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.commit_zero_net_settlement_operation(');
    expect(migration).toContain('v_operation_id UUID');
    expect(migration).toContain('WHERE t.operation_id = v_operation_id AND NOT t.is_reversal');
    expect(migration).not.toMatch(/WHERE t\.operation_id = operation_id(?!_)/);
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.commit_zero_net_settlement_operation(');
    expect(migration).toContain(') TO authenticated;');
    expect(migration).not.toContain('DROP TABLE');
  });

  it('derives reversal balances from actual cash direction and either-participant orientation', () => {
    const migration = readMigration('20260906000000_fix_zero_net_receipt_and_reversal_direction.sql');

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.reverse_settlement_operation(');
    expect(migration).toContain('p_operation_id UUID');
    expect(migration).toContain('p_expected_balance NUMERIC');
    expect(migration).toContain('cash_effect_actor');
    expect(migration).toContain('cash_has_rows');
    expect(migration).toContain('caller_expected_after');
    expect(migration).toContain('caller_current_balance');
    expect(migration).toContain('is_actor');
    expect(migration).not.toContain('SIGN(operation_row.expected_balance) * operation_row.requested_payment_amount');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.reverse_settlement_operation(UUID, NUMERIC) FROM PUBLIC, anon, service_role;');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.reverse_settlement_operation(UUID, NUMERIC) TO authenticated;');
    // Preserves the neutral combined-balance and compensating-row contracts.
    expect(migration).toContain('t.signed_group_balance_delta,');
    expect(migration).not.toContain('-t.signed_group_balance_delta,');
    expect(migration).not.toContain('DROP TABLE');
    expect(migration).not.toContain('DROP FUNCTION IF EXISTS public.reverse_settlement_operation');
  });

  it('excludes backfill-marked rows from authorized operation cash metadata', () => {
    const migration = readMigration('20260906050000_exclude_backfill_cash_from_operation_metadata.sql');
    expect(migration).toContain('s.backfilled_transfer_id IS NULL');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.get_friend_settlement_operations');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.get_group_settlement_operations');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.get_group_settlement_operations(UUID) TO authenticated;');
  });

  it('keeps the historical freeze version chain-safe for ticket 13', () => {
    const migration = readMigration('20260906010000_reject_new_scope_transfers.sql');

    expect(migration).toContain('to_regprocedure');
    expect(migration).toContain("public.commit_settlement_operation(uuid,uuid,uuid,text,numeric,text,timestamptz,numeric,jsonb,jsonb)");
    expect(migration).toContain("public.commit_zero_net_settlement_operation(uuid,uuid,text,timestamptz,numeric,jsonb)");
    // The historical version has no function replacement or privilege changes.
    expect(migration).not.toContain('DROP TABLE');
    expect(migration).not.toContain('REVOKE ALL');
    expect(migration).not.toContain('GRANT EXECUTE');
    expect(migration).not.toContain('DROP FUNCTION');
  });

  it('enforces the additive atomic full-settlement contract', () => {
    const migration = readMigration('20260906040000_atomic_full_settlement_contract.sql');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION private.settlement_user_write_lock(p_user_id UUID)');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION private.settlement_pair_write_lock(p_first_user_id UUID, p_second_user_id UUID)');
    expect(migration).toContain('CREATE TRIGGER serialize_settlement_balance_write');
    expect(migration).toContain('ON public.group_members');
    expect(migration).toContain('ON public.settlement_scope_transfers');
    expect(migration).not.toContain('settlement_balance_write_lock()');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION private.settlement_pair_scope_balance(');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.commit_settlement_operation(');
    expect(migration).toContain('ORDER BY u.id FOR UPDATE');
    expect(migration).toContain('SETTLEMENT_STALE_BALANCE');
    expect(migration).toContain('SETTLEMENT_ALLOCATION_OVER_BALANCE');
    expect(migration).toContain('SETTLEMENT_TRANSFERS_NOT_ALLOWED');
    expect(migration).toContain('IF full_payment THEN');
    expect(migration).toContain('requested_allocations <> expected_allocations');
    expect(migration).toContain('requested_transfers <> expected_transfers');
    expect(migration).toContain('Full friend settlement balance cancellation');
    expect(migration).not.toContain('SETTLEMENT_TRANSFERS_FROZEN');
    // Ticket 17 (option B): cancellation legs are transfer-free non-cash
    // effects in the ticket-09 from-user orientation — creditor-originated
    // with strictly negative signed deltas, matching the planner and the
    // dev-proven -15.50 shape. Absolute/positive deltas are rejected.
    expect(migration).toContain("'fromUserId', CASE WHEN residual_cents > 0 THEN app_user_id ELSE p_friend_id END");
    expect(migration).toContain("'signedGroupBalanceDelta', (-ABS(residual_cents))::NUMERIC / 100");
    expect(migration).toContain('OR transfer_delta IS NULL OR transfer_delta >= 0 OR');
    expect(migration).not.toContain('SETTLEMENT_TRANSFERS_FROZEN');
    expect(migration).not.toContain('DROP TABLE');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.commit_settlement_operation(');
    expect(migration).toContain('TO authenticated;');
  });

  it('mirrors the settlement_cancellations table columns and defaults in the checked-in supabase types', () => {
    const migration = readMigration('20260906060000_settlement_cancellations.sql');
    const supabaseTypes = readFileSync(
      new URL('../types/supabase.ts', import.meta.url),
      'utf8',
    );

    // Source-of-truth columns and defaults in the migration.
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.settlement_cancellations (');
    expect(migration).toContain('operation_id UUID NOT NULL REFERENCES public.settlement_operations(id)');
    expect(migration).toContain('group_id UUID NOT NULL REFERENCES public.groups(id)');
    expect(migration).toContain('amount NUMERIC NOT NULL CHECK (amount > 0 AND amount = ROUND(amount, 2))');
    expect(migration).toContain('signed_group_balance_delta NUMERIC NOT NULL CHECK (');
    expect(migration).toContain("currency TEXT NOT NULL DEFAULT 'USD'");
    expect(migration).toContain('note TEXT,');
    expect(migration).toContain('is_reversal BOOLEAN NOT NULL DEFAULT false');
    expect(migration).toContain('created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()');

    // Checked-in manual mirror carries the same columns (see the inline
    // source-migration comment on the table entry); currency/is_reversal/
    // created_at stay optional on Insert per their DB defaults.
    const entry = supabaseTypes.match(
      /settlement_cancellations: \{[\s\S]*?Relationships: \[\]/,
    )?.[0] ?? '';
    expect(entry).not.toBe('');
    for (const column of ['id', 'operation_id', 'group_id', 'amount', 'signed_group_balance_delta', 'currency', 'note', 'is_reversal', 'created_at']) {
      expect(entry).toContain(column);
    }
    expect(entry).toContain('currency?: string');
    expect(entry).toContain('is_reversal?: boolean');
    expect(entry).toContain('created_at?: string');

    // Compile-time pin: the table entry exists with the expected column types.
    const probe: CancellationRow = {
      id: 'id',
      operation_id: 'operation',
      group_id: 'group',
      amount: 0,
      signed_group_balance_delta: 0,
      currency: 'USD',
      note: null,
      is_reversal: false,
      created_at: 'now',
    };
    expect(probe.currency).toBe('USD');
  });

  it('commits cancellations through p_cancellations with frozen p_transfers and a cancellations receipt array', () => {
    const migration = readMigration('20260906060000_settlement_cancellations.sql');

    // New payload parameter on the 11-arg commit signature.
    expect(migration).toContain("p_cancellations JSONB DEFAULT '[]'::jsonb");
    // The scope-transfer table is frozen: any transfer payload is rejected.
    expect(migration).toContain("IF jsonb_array_length(COALESCE(p_transfers, '[]'::jsonb)) > 0 THEN");
    expect(migration).toContain("RAISE EXCEPTION 'SETTLEMENT_TRANSFERS_FROZEN';");
    // Cancellations are persisted to the dedicated table and returned next
    // to the legacy transfers array on the receipt.
    expect(migration).toContain('INSERT INTO public.settlement_cancellations (operation_id, group_id, amount, currency, note)');
    expect(migration).toContain('INTO cancellation_rows FROM public.settlement_cancellations c');
    expect(migration).toContain('WHERE c.operation_id = v_operation_id AND NOT c.is_reversal;');
    expect(migration).toContain("'cancellations', cancellation_rows");
  });
});
