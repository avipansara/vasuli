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
const cancellationMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260906060000_settlement_cancellations.sql'),
  'utf8',
);
const cancellationService = readFileSync(
  resolve(process.cwd(), 'services/settlement-cancellation-service.ts'),
  'utf8',
);
const settlementsHelper = readFileSync(resolve(process.cwd(), 'e2e/helpers/settlements.js'), 'utf8');
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
    // Dedicated surface: the reversal seed allocates the full payment
    // in-group (direct scope is zero, so no residual and no cancellation
    // legs) with frozen-empty p_transfers. The retired signed transfer leg
    // must not come back.
    const reversalSeedStart = fixtureSql.indexOf(
      'CREATE OR REPLACE FUNCTION public.seed_e2e_settlement_reversal',
    );
    const reversalSeedEnd = fixtureSql.indexOf(
      'CREATE OR REPLACE FUNCTION public.purge_e2e_fixture_run',
    );
    const reversalSeedSql = fixtureSql.slice(reversalSeedStart, reversalSeedEnd);
    expect(reversalSeedSql).toContain("'groupId', v_group_id,");
    expect(reversalSeedSql).toContain("'[]'::jsonb,");
    expect(reversalSeedSql).not.toContain('signedGroupBalanceDelta');
    expect(fixtureSql).not.toContain("'signedGroupBalanceDelta', -12.00");
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
    // Ticket 05 one-activity presentation: Balance details with adjustments,
    // legacy per-record wording asserted absent.
    expect(friendSettlementSpec).toContain("element(by.text('Balance details'))");
    expect(friendSettlementSpec).toContain("element(by.text('Balance adjustment'))");
    expect(friendSettlementSpec).toContain("element(by.text('No additional payment'))");
    expect(friendSettlementSpec).toContain('toBeNotVisible()');
    expect(friendSettlementSpec).not.toContain('reverseLastSettlementOnFriendDetail');
    expect(settlementReversalSpec).toContain("afterEach(async () =>");
    expect(settlementReversalSpec).toContain("element(by.label('Updates')).tap();");
    expect(settlementReversalSpec).toContain('deleteFriendSettlementOperation(operationId)');
  });

  it('selects settlement operations via stable testIDs, never a11y copy', () => {
    // Intended-operation selection uses operation-scoped testIDs (by.id).
    // Exact accessibility announcements (Delete settlement, {amount}, {friend}
    // / Delete balance clearing with {friend}) must never be E2E selectors.
    expect(settlementsHelper).toContain('friend-settlement-operation-${operationId}');
    expect(settlementsHelper).toContain('delete-settlement-operation-${operationId}');
    expect(settlementsHelper).toContain('group-settlement-operation-${operationId}');
    expect(settlementsHelper).toContain('delete-group-settlement-operation-${operationId}');
    expect(settlementsHelper).toContain('friend-balance-details-toggle-${operationId}');
    expect(settlementsHelper).toContain('group-balance-details-toggle-${operationId}');
    expect(settlementsHelper).not.toContain("by.label('Reverse settlement')");
    expect(settlementsHelper).not.toContain("by.label('Delete settlement,");
    expect(settlementsHelper).not.toContain("by.label('Delete balance clearing");
    expect(settlementsHelper).not.toContain('reverseLastSettlementOnFriendDetail');
    // Visible confirmation/result copy is asserted, not selected on.
    expect(settlementsHelper).toContain("element(by.text('Delete settlement?'))");
    expect(settlementsHelper).toContain("element(by.text('Delete balance clearing?'))");
    expect(settlementsHelper).toContain("element(by.text('Settlement deleted'))");
    expect(settlementsHelper).toContain("element(by.text('Balance changed'))");
    expect(settlementReversalSpec).toContain('friend-settlement-operation-${operationId}');
    expect(settlementReversalSpec).toContain('group-settlement-operation-${operationId}');
    expect(settlementReversalSpec).toContain("element(by.text('Deleted'))");
    expect(settlementReversalSpec).not.toContain('reverseLastSettlementOnFriendDetail');
    // Legacy labels may only appear in toBeNotVisible absence assertions —
    // never as a tap/select target.
    expect(settlementReversalSpec).not.toContain("by.label('Reverse settlement')).atIndex(0)");
    expect(settlementReversalSpec).not.toContain("element(by.label('Reverse settlement')).tap()");
    expect(settlementReversalSpec).not.toContain("by.label('Delete settlement,");
    expect(friendSettlementSpec).not.toContain("by.label('Reverse settlement')");
    expect(friendSettlementSpec).not.toContain("by.label('Delete settlement,");
    expect(friendSettlementSpec).not.toContain("element(by.text('USD 12.00'))");
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
    expect(purgeGroupsSql).toContain('cancellation.group_id = ANY(v_group_ids)');
    expect(purgeGroupsSql).toContain('settlement.group_id = ANY(v_group_ids)');
    expect(purgeGroupsSql).toContain('DELETE FROM public.settlement_operation_reversals');
    expect(purgeGroupsSql).toContain('DELETE FROM public.settlement_scope_transfers');
    expect(purgeGroupsSql).toContain('DELETE FROM public.settlement_cancellations');
    expect(purgeGroupsSql).toContain('DELETE FROM public.settlements');
    expect(purgeGroupsSql).toContain('DELETE FROM public.settlement_operations');
    expect(purgeGroupsSql).toContain('DELETE FROM public.settlement_commitments');
    expect(purgeGroupsSql).not.toContain('UPDATE public.settlements');

    const reversalIndex = purgeGroupsSql.indexOf('DELETE FROM public.settlement_operation_reversals');
    const transferIndex = purgeGroupsSql.indexOf('DELETE FROM public.settlement_scope_transfers');
    const cancellationIndex = purgeGroupsSql.indexOf('DELETE FROM public.settlement_cancellations');
    const settlementsIndex = purgeGroupsSql.indexOf('DELETE FROM public.settlements');
    const operationsIndex = purgeGroupsSql.indexOf('DELETE FROM public.settlement_operations');
    const commitmentsIndex = purgeGroupsSql.indexOf('DELETE FROM public.settlement_commitments');
    const groupsIndex = purgeGroupsSql.indexOf('DELETE FROM public.groups');
    expect(reversalIndex).toBeLessThan(transferIndex);
    expect(transferIndex).toBeLessThan(cancellationIndex);
    expect(cancellationIndex).toBeLessThan(settlementsIndex);
    expect(settlementsIndex).toBeLessThan(operationsIndex);
    expect(operationsIndex).toBeLessThan(commitmentsIndex);
    expect(commitmentsIndex).toBeLessThan(groupsIndex);
  });

  it('discovers and cleans cancellation rows in run-scoped fixtures', () => {
    // Task 10 cancellation surface: clean-friend selection skips pairs with
    // cancellation history, UI-operation discovery matches cancellation-linked
    // operations, and the run purge deletes cancellation rows FK-safe between
    // transfers and operations. Cancellations are never backfilled, so the
    // mirror carries no converted-operation exclusion.
    expect(fixtureSql).toContain('FROM public.settlement_cancellations cancellation');
    expect(fixtureSql).toContain('cancellation.operation_id = operation.id');
    expect(fixtureSql).toContain('cancellation.group_id = run.group_id');
    expect(fixtureSql).toContain('DELETE FROM public.settlement_cancellations');

    const purgeStart = fixtureSql.indexOf('CREATE OR REPLACE FUNCTION public.purge_e2e_fixture_run');
    const purgeEnd = fixtureSql.indexOf('CREATE OR REPLACE FUNCTION public.purge_e2e_stale_fixture_runs');
    const scopedPurgeSql = fixtureSql.slice(purgeStart, purgeEnd);
    const scopedTransferIndex = scopedPurgeSql.indexOf('DELETE FROM public.settlement_scope_transfers');
    const scopedCancellationIndex = scopedPurgeSql.indexOf('DELETE FROM public.settlement_cancellations');
    const scopedOperationsIndex = scopedPurgeSql.indexOf('DELETE FROM public.settlement_operations');
    expect(scopedTransferIndex).toBeGreaterThan(-1);
    expect(scopedCancellationIndex).toBeGreaterThan(scopedTransferIndex);
    expect(scopedOperationsIndex).toBeGreaterThan(scopedCancellationIndex);
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

  it('exposes committed cancellations through participant-scoped reads', () => {
    // Task 4 read surface: the pair-balance helper wires cancellation sums,
    // the operation-metadata readers carry per-operation cancellations, group
    // pair totals apply the same toward-zero math, and the friend/group RPCs
    // mirror the scope-transfer authorization shape.
    expect(cancellationMigration).toContain(
      'CREATE OR REPLACE FUNCTION private.settlement_pair_scope_balance(',
    );
    expect(cancellationMigration).toContain('settlement_cancellations c');
    expect(cancellationMigration).toContain('direct_cancellation_effect');
    expect(cancellationMigration).toContain('group_cancellation_net');
    expect(cancellationMigration).toContain(
      'CREATE OR REPLACE FUNCTION public.get_friend_cancellations(p_friend_id UUID)',
    );
    expect(cancellationMigration).toContain(
      'CREATE OR REPLACE FUNCTION public.get_group_cancellations(p_group_id UUID)',
    );
    expect(cancellationMigration).toContain(
      'GRANT EXECUTE ON FUNCTION public.get_friend_cancellations(UUID) TO authenticated;',
    );
    expect(cancellationMigration).toContain(
      'GRANT EXECUTE ON FUNCTION public.get_group_cancellations(UUID) TO authenticated;',
    );
    expect(cancellationMigration).toContain('original_to_user_id UUID, cancellations JSONB');
    expect(cancellationMigration).toContain('local_to_user_id UUID,');
    expect(cancellationMigration).toContain('cancellations JSONB');
    expect(cancellationMigration).toContain('gcanc_net');
    expect(cancellationMigration).toContain('dcanc_leg');
    // Cash attribution stays cash-only: cancellation legs never feed the
    // local payment amount or the committed cash totals.
    expect(cancellationMigration).not.toContain('local_payment_amount +');
    expect(cancellationMigration).not.toContain('requested_payment_amount +');
  });

  it('fetches cancellations with their immutable signed snapshot effect', () => {
    expect(cancellationService).toContain("supabase.rpc('get_friend_cancellations'");
    expect(cancellationService).toContain("supabase.rpc('get_group_cancellations'");
    expect(cancellationService).toContain('p_friend_id: friendId');
    expect(cancellationService).toContain('p_group_id: groupId');
    expect(cancellationService).toContain('async getByFriend(friendId: string)');
    expect(cancellationService).toContain('async getByGroup(groupId: string)');
    expect(cancellationService).toContain('operation_id:');
    expect(cancellationService).toContain('operationId: row.operation_id');
    expect(cancellationService).toContain('groupId: row.group_id');
    expect(cancellationService).toContain('isReversal: row.is_reversal');
    expect(cancellationService).toContain('signedGroupBalanceDelta');
    expect(cancellationService).not.toContain('fromUserId');
  });

  it('exposes the operation pair on cancellation reads for client scoping', () => {
    // Fix round 1: the read RPCs carry the parent operation's settling pair
    // so client resolvers scope cancellation-only operations; the service
    // maps the columns while keeping the legacy shape for older rows.
    expect(cancellationMigration).toContain('o.actor_user_id, o.friend_user_id');
    expect(cancellationMigration).toContain('actor_user_id UUID,\n  friend_user_id UUID');
    expect(cancellationService).toContain('actor_user_id?: string | null');
    expect(cancellationService).toContain('actorUserId: row.actor_user_id');
    expect(cancellationService).toContain('friendUserId: row.friend_user_id');
    expect(cancellationService).not.toContain('fromUserId');
  });

  it('discovers and purges cancellation rows wherever transfer rows are handled', () => {
    // Legacy group cleanup mirrors every transfer-table statement.
    expect(purgeGroupsSql).toContain('cancellation.group_id = ANY(v_group_ids)');
    expect(purgeGroupsSql).toContain('DELETE FROM public.settlement_cancellations');

    // Run-scoped cleanup discovers cancellation-linked operations and
    // deletes their cancellation rows with the operation.
    expect(fixtureSql).toContain('cancellation.group_id = run.group_id');
    expect(fixtureSql).toContain('DELETE FROM public.settlement_cancellations');

    // FK-safe order: cancellations reference operations and groups, so
    // their delete sits with the other operation-child deletes, before
    // settlements, operations, and groups are removed.
    const transferIndex = purgeGroupsSql.indexOf('DELETE FROM public.settlement_scope_transfers');
    const cancellationIndex = purgeGroupsSql.indexOf('DELETE FROM public.settlement_cancellations');
    const settlementsIndex = purgeGroupsSql.indexOf('DELETE FROM public.settlements');
    const operationsIndex = purgeGroupsSql.indexOf('DELETE FROM public.settlement_operations');
    const groupsIndex = purgeGroupsSql.indexOf('DELETE FROM public.groups');
    expect(cancellationIndex).toBeGreaterThan(-1);
    expect(transferIndex).toBeLessThan(cancellationIndex);
    expect(cancellationIndex).toBeLessThan(settlementsIndex);
    expect(settlementsIndex).toBeLessThan(operationsIndex);
    expect(operationsIndex).toBeLessThan(groupsIndex);

    // Converted (backfilled) rows keep their exclusion: the legacy
    // settlement path still only matches rows without operation links,
    // and cancellations always carry one, so they can never leak there.
    expect(fixtureSql).toContain('settlement.operation_id IS NULL');
    expect(fixtureSql).toContain('settlement.commitment_id IS NULL');
  });

  it('keeps the self-contained pgTAP regression test in sync with the fixture sources', () => {
    // `supabase test db` executes each test file in a container where only
    // that file is visible, so supabase/tests/e2e-run-scoped-fixtures.sql
    // inlines byte-identical copies of the fixtures instead of \ir includes.
    // If a fixture changes, re-apply the splice documented in the test file
    // header until this passes again.
    const regressionTest = readFileSync(
      resolve(process.cwd(), 'supabase/tests/e2e-run-scoped-fixtures.sql'),
      'utf8',
    );
    // Include lines start at column 0; the header comment may still name the
    // retired `\ir` path, so only match line-leading meta-commands.
    expect(regressionTest).not.toContain('\n\\ir ');
    expect(regressionTest).toContain(fixtureSql);
    expect(regressionTest).toContain(purgeGroupsFixtureSql);
    // The run-scoped fixture is installed twice to prove re-runs preserve
    // grants and revocations.
    const installs = regressionTest.split(fixtureSql).length - 1;
    expect(installs).toBe(2);
  });
});
