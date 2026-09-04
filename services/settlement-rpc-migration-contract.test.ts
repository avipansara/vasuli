import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

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
});
