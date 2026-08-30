const { createClient } = require('@supabase/supabase-js');

const TEST_EMAIL = process.env.EXPO_PUBLIC_TEST_ACCOUNT_EMAIL;
const TEST_OTP = process.env.EXPO_PUBLIC_TEST_ACCOUNT_OTP;
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY;
const GROUP_PREFIX = 'Detox Group ';

function isRunScopedCleanup() {
  return process.env.E2E_FIXTURE_MODE === '1'
    && typeof process.env.E2E_RUN_ID === 'string'
    && process.env.E2E_RUN_ID.length > 0;
}

function fail(message) {
  console.error(`[e2e-cleanup] ${message}`);
  process.exitCode = 1;
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY || !TEST_EMAIL || !TEST_OTP) {
    fail('Set the development Supabase environment and E2E account variables first.');
    return;
  }

  const host = new URL(SUPABASE_URL).hostname;
  if (host !== 'jtnculejudbioyecytap.supabase.co') {
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
      return;
    }

    if (!process.argv.includes('--apply')) {
      console.log(`[e2e-cleanup] Run-scoped dry run for ${runId}${workerId ? `/${workerId}` : ''}.`);
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
