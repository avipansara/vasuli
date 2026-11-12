const { createClient } = require('@supabase/supabase-js');
const fs = require('node:fs');
const path = require('node:path');

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const values = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  return values;
}

const localDevEnv = readEnvFile(path.resolve(__dirname, '../.env.development.local'));
const SUPABASE_URL = localDevEnv.EXPO_PUBLIC_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = localDevEnv.EXPO_PUBLIC_SUPABASE_KEY || process.env.EXPO_PUBLIC_SUPABASE_KEY;
const TEST_EMAIL = localDevEnv.EXPO_PUBLIC_TEST_ACCOUNT_EMAIL || process.env.EXPO_PUBLIC_TEST_ACCOUNT_EMAIL;
const TEST_OTP = localDevEnv.EXPO_PUBLIC_TEST_ACCOUNT_OTP || process.env.EXPO_PUBLIC_TEST_ACCOUNT_OTP;
const EXPECTED_DEV_HOST = (() => {
  try {
    return localDevEnv.EXPO_PUBLIC_SUPABASE_URL
      ? new URL(localDevEnv.EXPO_PUBLIC_SUPABASE_URL).hostname
      : process.env.SUPABASE_DEV_HOST || null;
  } catch {
    return null;
  }
})();
const GROUP_PREFIX = 'Detox Group ';
// Must stay in sync with the description built in tester-e2e/direct-expense.e2e.ts.
const DIRECT_EXPENSE_PREFIX = 'TesterArmy direct ';
// Mirrors the fixture's own p_run_id guard so a malformed value can never widen the LIKE pattern.
const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

function isRunScopedCleanup() {
  return process.env.E2E_FIXTURE_MODE === '1'
    && typeof process.env.E2E_RUN_ID === 'string'
    && process.env.E2E_RUN_ID.length > 0;
}

function fail(message) {
  console.error(`[e2e-cleanup] ${message}`);
  process.exitCode = 1;
}

function escapeLikePattern(value) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

// UI-created direct friend expenses never reach public.e2e_fixture_runs, so
// purge_e2e_fixture_run cannot see them: that RPC removes only the expense
// UUIDs its seed helpers wrote. Those rows are still removable by the
// authenticated E2E account, because the creator/payer policies on
// public.expenses and public.expense_splits
// (migrations/019_expense_creator_and_payer.sql) and the actor-scoped
// activities_delete_authenticated policy
// (migrations/009_bridge_auth_rls_policies.sql) all admit the signed-in actor
// for a row it created.
async function purgeRunScopedDirectExpenses(supabase, runId, { apply }) {
  if (!RUN_ID_PATTERN.test(runId)) {
    throw new Error(`Refusing direct expense cleanup for an invalid run ID: ${runId}`);
  }
  const pattern = `${DIRECT_EXPENSE_PREFIX}${escapeLikePattern(runId)}%`;

  // group_id IS NULL keeps this to direct friend expenses. The recurring guard
  // keeps a rule-owned occurrence (ON DELETE RESTRICT) out of scope even if a
  // description ever collided.
  const { data: expenses, error: queryError } = await supabase
    .from('expenses')
    .select('id,description,deleted_at')
    .is('group_id', null)
    .like('description', pattern);
  if (queryError) throw queryError;

  const expenseIds = (expenses ?? []).map(({ id }) => id);
  if (expenseIds.length === 0) {
    console.log(`[e2e-cleanup] No direct expenses found for run ${runId}.`);
    return;
  }

  if (!apply) {
    console.log(`[e2e-cleanup] Would delete ${expenseIds.length} direct expense(s) for run ${runId}:`);
    expenses.forEach(({ description, deleted_at: deletedAt }) => {
      console.log(`  - ${description} (${deletedAt ? 'soft-deleted' : 'active'})`);
    });
    return;
  }

  // activities.target_id carries no FK to expenses, so these rows would
  // otherwise outlive the expense. They are deleted first.
  const { data: activities, error: activityError } = await supabase
    .from('activities')
    .delete()
    .in('target_id', expenseIds)
    .select('id');
  if (activityError) throw activityError;

  // expense_splits.expense_id cascades, but deleting the child explicitly keeps
  // the fixtures' child-before-parent order and surfaces split RLS errors
  // directly rather than hiding them behind a cascade.
  const { data: splits, error: splitError } = await supabase
    .from('expense_splits')
    .delete()
    .in('expense_id', expenseIds)
    .select('id');
  if (splitError) throw splitError;

  const { data: removedExpenses, error: expenseError } = await supabase
    .from('expenses')
    .delete()
    .in('id', expenseIds)
    .select('id');
  if (expenseError) throw expenseError;

  console.log(
    `[e2e-cleanup] Purged ${removedExpenses?.length ?? 0} direct expense(s), `
    + `${splits?.length ?? 0} split(s), and ${activities?.length ?? 0} activity row(s) for run ${runId}.`,
  );
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY || !TEST_EMAIL || !TEST_OTP) {
    fail('Set the development Supabase environment and E2E account variables first.');
    return;
  }

  let host;
  try {
    host = new URL(SUPABASE_URL).hostname;
  } catch {
    fail('The configured Supabase URL is invalid.');
    return;
  }
  const devProjectId = process.env.SUPABASE_DEV_PROJECT_ID;
  const prodProjectId = process.env.SUPABASE_PROD_PROJECT_ID;
  const allowedHost = EXPECTED_DEV_HOST
    || (devProjectId ? `${devProjectId}.supabase.co` : null);
  if (!allowedHost || host !== allowedHost || (prodProjectId && host.includes(prodProjectId))) {
    fail(`Refusing cleanup against non-development Supabase host: ${host}`);
    return;
  }

  if (process.argv.includes('--apply') && process.env.E2E_CLEANUP_CONFIRM !== 'delete') {
    fail('Destructive cleanup requires E2E_CLEANUP_CONFIRM=delete.');
    return;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: authError } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_OTP,
  });
  if (authError) throw authError;

  if (isRunScopedCleanup()) {
    const runId = process.env.E2E_RUN_ID;
    const workerId = process.env.E2E_WORKER_ID || null;
    const testKey = process.env.E2E_TEST_KEY || null;
    const staleRunId = process.env.E2E_STALE_RUN_ID || null;
    const staleBefore = process.env.E2E_STALE_BEFORE || null;

    if (staleRunId || staleBefore) {
      if (process.argv.includes('--apply') && process.env.E2E_CLEANUP_CONFIRM !== 'delete') {
        fail('Stale cleanup requires E2E_CLEANUP_CONFIRM=delete.');
        return;
      }
      if (!staleRunId || !staleBefore) {
        fail('Stale cleanup requires both E2E_STALE_RUN_ID and E2E_STALE_BEFORE.');
        return;
      }
      if (!process.argv.includes('--apply')) {
        console.log(`[e2e-cleanup] Would purge stale fixture run ${staleRunId} before ${staleBefore}.`);
        await purgeRunScopedDirectExpenses(supabase, staleRunId, { apply: false });
        return;
      }
      const { data: staleCount, error: staleError } = await supabase.rpc('purge_e2e_stale_fixture_runs', {
        p_before: staleBefore,
        p_run_id: staleRunId,
      });
      if (staleError) throw new Error(
        `${staleError.message} (Apply supabase/fixtures/e2e-run-scoped-fixtures.sql in development first.)`,
      );
      console.log(`[e2e-cleanup] Purged ${staleCount} stale fixture scenario(s).`);
      await purgeRunScopedDirectExpenses(supabase, staleRunId, { apply: true });
      return;
    }

    if (!process.argv.includes('--apply')) {
      console.log(`[e2e-cleanup] Run-scoped dry run for ${runId}${workerId ? `/${workerId}` : ''}.`);
      await purgeRunScopedDirectExpenses(supabase, runId, { apply: false });
      return;
    }

    const { data: deletedCount, error: fixtureError } = await supabase.rpc('purge_e2e_fixture_run', {
      p_run_id: runId,
      p_worker_id: workerId,
      p_test_key: testKey,
    });
    if (fixtureError) throw new Error(
      `${fixtureError.message} (Apply supabase/fixtures/e2e-run-scoped-fixtures.sql in development first.)`,
    );
    console.log(`[e2e-cleanup] Purged ${deletedCount} fixture scenario(s) for run ${runId}.`);

    // Run-scoped fixtures do not cover the two lifecycle journeys that create
    // Groups through the UI. Those helpers include this run ID in their names,
    // so clear only this run's legacy records here. The SQL function enforces
    // the E2E prefix and the host check above keeps this path away from
    // production.
    const legacyGroupPrefix = `${GROUP_PREFIX}${runId}`;
    const { data: legacyGroupCount, error: legacyGroupError } = await supabase.rpc('purge_e2e_groups', {
      group_prefix: legacyGroupPrefix,
    });
    if (legacyGroupError) throw new Error(
      `${legacyGroupError.message} (Apply supabase/fixtures/e2e-purge-groups.sql in the development Supabase SQL editor first.)`,
    );
    console.log(`[e2e-cleanup] Purged ${legacyGroupCount} legacy UI Group(s) for run ${runId}.`);

    // The direct friend expense created through the UI in
    // tester-e2e/direct-expense.e2e.ts never reaches e2e_fixture_runs, so the
    // RPCs above cannot remove it. RLS lets this account delete its own rows.
    await purgeRunScopedDirectExpenses(supabase, runId, { apply: true });
    return;
  }

  const { data: appUsers, error: userError } = await supabase
    .from('users')
    .select('id')
    .ilike('email', TEST_EMAIL)
    .order('created_at', { ascending: true })
    .limit(1);
  if (userError) throw userError;
  const appUser = appUsers?.[0];
  if (!appUser) throw new Error(`No app user found for ${TEST_EMAIL}.`);

  const { data: memberships, error: membershipError } = await supabase
    .from('group_members')
    .select('group_id')
    .eq('user_id', appUser.id);
  if (membershipError) throw membershipError;

  const groupIds = (memberships ?? []).map(({ group_id: groupId }) => groupId);
  if (groupIds.length === 0) {
    console.log('[e2e-cleanup] No E2E groups found.');
    return;
  }

  const { data: groups, error: groupError } = await supabase
    .from('groups')
    .select('id,name')
    .in('id', groupIds)
    .like('name', `${GROUP_PREFIX}%`);
  if (groupError) throw groupError;

  if (!process.argv.includes('--apply')) {
    if (!groups?.length) {
      console.log('[e2e-cleanup] No prefixed E2E groups found.');
      return;
    }
    console.log(`[e2e-cleanup] Would delete ${groups.length} group(s):`);
    groups.forEach(({ name }) => console.log(`  - ${name}`));
    return;
  }

  // Group deletion goes through the development-only purge_e2e_groups fixture
  // because settlement scope transfers and settlement operations restrict
  // direct group deletes. The fixture only sees prefixed Groups where the
  // authenticated, allowlisted E2E actor is a member.
  const { data: deletedCount, error: purgeError } = await supabase.rpc('purge_e2e_groups', {
    group_prefix: GROUP_PREFIX,
  });
  if (purgeError) {
    throw new Error(
      `${purgeError.message} (Apply supabase/fixtures/e2e-purge-groups.sql in the development Supabase SQL editor first.)`,
    );
  }
  console.log(`[e2e-cleanup] Purged ${deletedCount} prefixed E2E group(s).`);
}

main().catch((error) => {
  console.error('[e2e-cleanup] Failed:', error.message ?? error);
  process.exitCode = 1;
});
