const { createClient } = require('@supabase/supabase-js');

const TEST_EMAIL = process.env.EXPO_PUBLIC_TEST_ACCOUNT_EMAIL;
const TEST_OTP = process.env.EXPO_PUBLIC_TEST_ACCOUNT_OTP;
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY;
const GROUP_PREFIX = 'Detox Group ';

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

  if (!groups?.length) {
    console.log('[e2e-cleanup] No prefixed E2E groups found.');
    return;
  }

  if (!process.argv.includes('--apply')) {
    console.log(`[e2e-cleanup] Would delete ${groups.length} group(s):`);
    groups.forEach(({ name }) => console.log(`  - ${name}`));
    return;
  }

  // Group deletion goes through the development-only purge_e2e_groups fixture
  // because settlement scope transfers and settlement operations restrict
  // direct group deletes.
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
