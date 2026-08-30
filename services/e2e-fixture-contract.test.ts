import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const fixtureSql = readFileSync(
  resolve(process.cwd(), 'supabase/fixtures/e2e-run-scoped-fixtures.sql'),
  'utf8',
);
const setupSql = readFileSync(
  resolve(process.cwd(), 'supabase/fixtures/e2e-run-scoped-fixtures.setup.sql'),
  'utf8',
);
const fixtureHelper = readFileSync(resolve(process.cwd(), 'e2e/helpers/fixtures.js'), 'utf8');
const cleanupScript = readFileSync(resolve(process.cwd(), 'scripts/e2e-cleanup.cjs'), 'utf8');
const purgeGroupsFixtureSql = readFileSync(
  resolve(process.cwd(), 'supabase/fixtures/e2e-purge-groups.sql'),
  'utf8',
);
const friendSettlementSpec = readFileSync(resolve(process.cwd(), 'e2e/friend-settle.test.js'), 'utf8');
const settlementReversalSpec = readFileSync(resolve(process.cwd(), 'e2e/settlement-reversal.test.js'), 'utf8');
const purgeGroupsSql = purgeGroupsFixtureSql.slice(
  purgeGroupsFixtureSql.indexOf('CREATE OR REPLACE FUNCTION public.purge_e2e_groups'),
  purgeGroupsFixtureSql.indexOf('REVOKE EXECUTE ON FUNCTION public.purge_e2e_groups(text)'),
);

describe('run-scoped E2E fixture SQL contract', () => {
  it('fails closed unless development fixture settings and an approved account exist', () => {
    expect(fixtureSql).toContain("settings.environment = 'development'");
    expect(fixtureSql).toContain('E2E_FIXTURE_DEVELOPMENT_ONLY');
    expect(fixtureSql).toContain('E2E_FIXTURE_UNAUTHENTICATED');
    expect(fixtureSql).toContain('E2E_FIXTURE_ACCOUNT_NOT_APPROVED');
    expect(fixtureSql).toContain('E2E_FIXTURE_CLEAN_FRIEND_NOT_FOUND');
    expect(fixtureSql).toContain('account.auth_user_id = (SELECT auth.uid())');
  });

  it('requires run, worker, and test keys and makes repeated scenarios idempotent', () => {
    expect(fixtureSql).toContain('p_run_id text');
    expect(fixtureSql).toContain('p_worker_id text');
    expect(fixtureSql).toContain('p_test_key text');
    expect(fixtureSql).toContain("scenario IN ('accepted_friendship', 'group_membership', 'outstanding_group_balance', 'settlement_reversal')");
    expect(fixtureSql).toContain('DROP CONSTRAINT IF EXISTS e2e_fixture_runs_scenario_check');
    expect(fixtureSql).toContain('PRIMARY KEY (run_id, worker_id, test_key, scenario)');
    expect(fixtureSql).toContain('pg_advisory_xact_lock(hashtextextended(v_marker, 0))');
    expect(fixtureSql).toContain('RETURN jsonb_build_object');
    expect(fixtureSql).toContain('settlement_operation_id uuid');
    expect(fixtureSql).toContain('public.commit_settlement_operation(');
    expect(fixtureSql).toContain("'signedGroupBalanceDelta', -12.00");
    expect(fixtureSql).toContain('v_ui_operation_ids uuid[]');
    expect(fixtureSql).toContain('operation.group_id = run.group_id');
    expect(fixtureSql).toContain('transfer.group_id = run.group_id');
    expect(fixtureSql).toContain('v_legacy_settlement_ids uuid[]');
    expect(fixtureSql).toContain('v_legacy_activity_ids uuid[]');
    expect(fixtureSql).toContain("activity.type = 'settlement_created'");
    expect(fixtureSql).toContain('settlement.id = activity.target_id');
  });

  it('removes only legacy UI settlements linked by the selected fixture activity', () => {
    const purgeStart = fixtureSql.indexOf('CREATE OR REPLACE FUNCTION public.purge_e2e_fixture_run');
    const purgeEnd = fixtureSql.indexOf('CREATE OR REPLACE FUNCTION public.purge_e2e_stale_fixture_runs');
    const purgeSql = fixtureSql.slice(purgeStart, purgeEnd);

    expect(purgeSql).toContain('activity.group_id = run.group_id');
    expect(purgeSql).toContain('JOIN public.groups fixture_group');
    expect(purgeSql).toContain('activity.group_name = fixture_group.name');
    expect(purgeSql).toContain("activity.type = 'settlement_created'");
    expect(purgeSql).toContain('settlement.id = activity.target_id');
    expect(purgeSql).toContain('settlement.group_id = run.group_id');
    expect(purgeSql).toContain('settlement.group_id IS NULL');
    expect(purgeSql).toContain('settlement.operation_id IS NULL');
    expect(purgeSql).toContain('settlement.commitment_id IS NULL');
    expect(purgeSql).toContain('settlement.from_user_id = run.actor_user_id');
    expect(purgeSql).toContain('settlement.to_user_id = run.friend_user_id');
    expect(purgeSql).toContain('settlement.from_user_id = run.friend_user_id');
    expect(purgeSql).toContain('settlement.to_user_id = run.actor_user_id');
    expect(purgeSql).toContain('DELETE FROM public.activities');
    expect(purgeSql).toContain('WHERE id = ANY(v_legacy_activity_ids)');
    expect(purgeSql).toContain('WHERE id = ANY(v_legacy_settlement_ids)');

    const activityDeleteIndex = purgeSql.indexOf('DELETE FROM public.activities');
    const settlementDeleteIndex = purgeSql.indexOf('DELETE FROM public.settlements');
    const groupDeleteIndex = purgeSql.indexOf('DELETE FROM public.groups');
    expect(activityDeleteIndex).toBeGreaterThan(-1);
    expect(activityDeleteIndex).toBeLessThan(settlementDeleteIndex);
    expect(settlementDeleteIndex).toBeLessThan(groupDeleteIndex);
  });

  it('limits cleanup to the selected actor and run, with an explicit stale-run age guard', () => {
    expect(fixtureSql).toContain('run.actor_user_id = v_actor_id');
    expect(fixtureSql).toContain('run.run_id = p_run_id');
    expect(fixtureSql).toContain('E2E_FIXTURE_STALE_RUN_REQUIRES_EXPLICIT_OLD_RUN');
    expect(fixtureSql).toContain("p_before >= now() - interval '1 hour'");
    expect(fixtureSql).toContain('ON DELETE SET NULL');
  });

  it('exposes authenticated focused cleanup and refreshes Ticket 07 reads', () => {
    expect(fixtureHelper).toContain('async function purgeFixtureRun');
    expect(fixtureHelper).toContain("client.rpc('purge_e2e_fixture_run'");
    expect(fixtureHelper).toContain('purgeFixtureRun,');
    expect(friendSettlementSpec).toContain("afterEach(async () =>");
    expect(friendSettlementSpec).toContain('await device.reloadReactNative();');
    expect(friendSettlementSpec).toContain("element(by.label('Updates')).tap();");
    expect(friendSettlementSpec).toContain('openGroupDetails(fixture.groupName)');
    expect(friendSettlementSpec).toContain("element(by.text('Moved from friendship balance'))");
    expect(friendSettlementSpec).toContain("element(by.text('USD 12.00'))");
    expect(settlementReversalSpec).toContain("afterEach(async () =>");
    expect(settlementReversalSpec).toContain("element(by.label('Updates')).tap();");
    expect(settlementReversalSpec).toContain('reverseLastSettlementOnFriendDetail();');
  });

  it('purges every fixture-backed spec by its exact test key', () => {
    const fixtureSpecs = [
      ['e2e/activity-balances.test.js', 'activity-settlement-balance'],
      ['e2e/deletion-guards.test.js', 'deletion-guards'],
      ['e2e/direct-expenses.test.js', 'direct-expense-lifecycle'],
      ['e2e/payer-selection.test.js', 'payer-selection'],
      ['e2e/split-methods.test.js', 'split-custom'],
      ['e2e/friend-settle.test.js', 'friend-settlement'],
      ['e2e/settlement-reversal.test.js', 'settlement-reversal'],
    ] as const;

    for (const [file, testKey] of fixtureSpecs) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8');
      expect(source).toContain(`testKey: '${testKey}'`);
      expect(source).toContain('afterEach(async () =>');
      expect(source).toContain('purgeFixtureRun');
    }
  });

  it('scopes run cleanup to named legacy UI Groups', () => {
    expect(cleanupScript).toContain("supabase.rpc('purge_e2e_groups'");
    expect(cleanupScript).toContain('const legacyGroupPrefix = `${GROUP_PREFIX}${runId}`');
    expect(cleanupScript).toContain('group_prefix: legacyGroupPrefix');
    expect(cleanupScript).not.toContain('E2E_CLEANUP_HISTORY');
    expect(cleanupScript).toContain("host !== 'jtnculejudbioyecytap.supabase.co'");
  });

  it('hardens legacy cleanup behind the run-scoped development actor boundary', () => {
    expect(purgeGroupsSql).toContain('PERFORM public.e2e_fixture_require_development()');
    expect(purgeGroupsSql).toContain('v_actor_id := public.e2e_fixture_actor()');
    expect(purgeGroupsSql).toContain("coalesce(array_agg(fixture_group.id), '{}')");
    expect(purgeGroupsSql).toContain('member.user_id = v_actor_id');
    expect(purgeGroupsFixtureSql).toContain('DROP FUNCTION IF EXISTS public.purge_e2e_history(uuid)');
    expect(purgeGroupsFixtureSql).toContain(
      'REVOKE EXECUTE ON FUNCTION public.purge_e2e_groups(text) FROM PUBLIC, anon, service_role',
    );
    expect(cleanupScript).not.toContain("supabase.rpc('purge_e2e_history'");
    const readme = readFileSync(resolve(process.cwd(), 'README.md'), 'utf8');
    expect(readme.indexOf('e2e-run-scoped-fixtures.sql')).toBeLessThan(
      readme.indexOf('e2e-purge-groups.sql'),
    );
  });

  it('purges selected-group operations in FK-safe order without nulling operation links', () => {
    expect(purgeGroupsSql).toContain('v_commitment_ids uuid[]');
    expect(purgeGroupsSql).toContain('operation.group_id = ANY(v_group_ids)');
    expect(purgeGroupsSql).toContain('transfer.group_id = ANY(v_group_ids)');
    expect(purgeGroupsSql).toContain('settlement.group_id = ANY(v_group_ids)');
    expect(purgeGroupsSql).toContain('DELETE FROM public.settlement_operation_reversals');
    expect(purgeGroupsSql).toContain('DELETE FROM public.settlement_scope_transfers');
    expect(purgeGroupsSql).toContain('DELETE FROM public.settlements');
    expect(purgeGroupsSql).toContain('DELETE FROM public.settlement_operations');
    expect(purgeGroupsSql).toContain('DELETE FROM public.settlement_commitments');
    expect(purgeGroupsSql).not.toContain('UPDATE public.settlements');

    const reversalIndex = purgeGroupsSql.indexOf('DELETE FROM public.settlement_operation_reversals');
    const transferIndex = purgeGroupsSql.indexOf('DELETE FROM public.settlement_scope_transfers');
    const settlementsIndex = purgeGroupsSql.indexOf('DELETE FROM public.settlements');
    const operationsIndex = purgeGroupsSql.indexOf('DELETE FROM public.settlement_operations');
    const commitmentsIndex = purgeGroupsSql.indexOf('DELETE FROM public.settlement_commitments');
    const groupsIndex = purgeGroupsSql.indexOf('DELETE FROM public.groups');
    expect(reversalIndex).toBeLessThan(transferIndex);
    expect(transferIndex).toBeLessThan(settlementsIndex);
    expect(settlementsIndex).toBeLessThan(operationsIndex);
    expect(operationsIndex).toBeLessThan(commitmentsIndex);
    expect(commitmentsIndex).toBeLessThan(groupsIndex);
  });

  it('grants only authenticated callers the fixture RPCs', () => {
    expect(fixtureSql).toContain('REVOKE ALL ON FUNCTION public.configure_e2e_fixture_account(text) FROM PUBLIC, anon, authenticated, service_role');
    expect(fixtureSql).toContain('REVOKE ALL ON FUNCTION public.e2e_fixture_actor() FROM PUBLIC, anon, authenticated');
    expect(fixtureSql).toContain('REVOKE ALL ON FUNCTION public.e2e_fixture_require_development() FROM PUBLIC, anon, authenticated');
    expect(fixtureSql).toContain('REVOKE ALL ON FUNCTION public.seed_e2e_outstanding_group');
    expect(fixtureSql).toContain('REVOKE ALL ON FUNCTION public.seed_e2e_group_membership');
    expect(fixtureSql).toContain('REVOKE ALL ON FUNCTION public.seed_e2e_friendship');
    expect(fixtureSql).toContain('REVOKE ALL ON FUNCTION public.seed_e2e_settlement_reversal');
    expect(fixtureSql).toContain('GRANT EXECUTE ON FUNCTION public.seed_e2e_outstanding_group');
    expect(fixtureSql).toContain('GRANT EXECUTE ON FUNCTION public.seed_e2e_group_membership');
    expect(fixtureSql).toContain('GRANT EXECUTE ON FUNCTION public.seed_e2e_friendship');
    expect(fixtureSql).toContain('GRANT EXECUTE ON FUNCTION public.seed_e2e_settlement_reversal');
    expect(fixtureSql).toContain('REVOKE ALL ON public.e2e_fixture_runs FROM PUBLIC, anon, authenticated');
  });

  it('keeps installation executable without placeholders and isolates account setup', () => {
    expect(fixtureSql).not.toContain('REPLACE_WITH_E2E_ACCOUNT_EMAIL');
    expect(setupSql).toContain('REPLACE_WITH_E2E_ACCOUNT_EMAIL');
    expect(setupSql).toContain('configure_e2e_fixture_account');
    expect(setupSql).toContain("environment, enabled");
  });
});
