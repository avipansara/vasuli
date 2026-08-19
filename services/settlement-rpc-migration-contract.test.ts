import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readMigration = (name: string) => readFileSync(
  new URL(`../supabase/migrations/${name}`, import.meta.url),
  'utf8',
);

describe('settlement RPC migration contracts', () => {
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
});
