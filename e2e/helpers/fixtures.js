const { createClient } = require('@supabase/supabase-js');

let fixtureClient;

function getFixtureClient() {
  if (fixtureClient) return fixtureClient;

  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;
  if (!url || !key) {
    throw new Error('Run-scoped E2E fixtures require the development Supabase URL and anon key.');
  }

  fixtureClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return fixtureClient;
}

async function seedOutstandingGroup({
  runId = process.env.E2E_RUN_ID,
  workerId = process.env.E2E_WORKER_ID ?? 'worker-0',
  testKey,
} = {}) {
  if (!runId || !testKey) {
    throw new Error('seedOutstandingGroup requires E2E_RUN_ID and a test key.');
  }

  const email = process.env.EXPO_PUBLIC_TEST_ACCOUNT_EMAIL;
  const password = process.env.EXPO_PUBLIC_TEST_ACCOUNT_OTP;
  if (!email || !password) {
    throw new Error('Run-scoped E2E fixtures require the configured development E2E account.');
  }

  const client = getFixtureClient();
  const { error: authError } = await client.auth.signInWithPassword({ email, password });
  if (authError) throw new Error(`E2E fixture authentication failed: ${authError.message}`);

  const { data, error } = await client.rpc('seed_e2e_outstanding_group', {
    p_run_id: runId,
    p_worker_id: workerId,
    p_test_key: testKey,
  });
  if (error) throw new Error(`E2E fixture seeding failed: ${error.message}`);
  if (!data?.groupId || !data?.friendId || !data?.expenseId
      || data.expectedBalance !== 12 || data.expectedBalanceDirection !== 'friend_owes_you'
      || data.paymentAmount !== 12) {
    throw new Error('E2E fixture returned incomplete outstanding-group identifiers.');
  }
  return data;
}

async function seedGroupMembership({
  runId = process.env.E2E_RUN_ID,
  workerId = process.env.E2E_WORKER_ID ?? 'worker-0',
  testKey,
} = {}) {
  if (!runId || !testKey) {
    throw new Error('seedGroupMembership requires E2E_RUN_ID and a test key.');
  }

  const email = process.env.EXPO_PUBLIC_TEST_ACCOUNT_EMAIL;
  const password = process.env.EXPO_PUBLIC_TEST_ACCOUNT_OTP;
  if (!email || !password) {
    throw new Error('Run-scoped E2E fixtures require the configured development E2E account.');
  }

  const client = getFixtureClient();
  const { error: authError } = await client.auth.signInWithPassword({ email, password });
  if (authError) throw new Error(`E2E fixture authentication failed: ${authError.message}`);

  const { data, error } = await client.rpc('seed_e2e_group_membership', {
    p_run_id: runId,
    p_worker_id: workerId,
    p_test_key: testKey,
  });
  if (error) throw new Error(`E2E fixture seeding failed: ${error.message}`);
  if (!data?.groupId || !data?.friendId) {
    throw new Error('E2E fixture returned incomplete group-membership identifiers.');
  }
  return data;
}

async function seedSettlementReversal({
  runId = process.env.E2E_RUN_ID,
  workerId = process.env.E2E_WORKER_ID ?? 'worker-0',
  testKey,
} = {}) {
  if (!runId || !testKey) {
    throw new Error('seedSettlementReversal requires E2E_RUN_ID and a test key.');
  }

  const email = process.env.EXPO_PUBLIC_TEST_ACCOUNT_EMAIL;
  const password = process.env.EXPO_PUBLIC_TEST_ACCOUNT_OTP;
  if (!email || !password) {
    throw new Error('Run-scoped E2E fixtures require the configured development E2E account.');
  }

  const client = getFixtureClient();
  const { error: authError } = await client.auth.signInWithPassword({ email, password });
  if (authError) throw new Error(`E2E fixture authentication failed: ${authError.message}`);

  const { data, error } = await client.rpc('seed_e2e_settlement_reversal', {
    p_run_id: runId,
    p_worker_id: workerId,
    p_test_key: testKey,
  });
  if (error) throw new Error(`E2E fixture seeding failed: ${error.message}`);
  if (!data?.groupId || !data?.friendId || !data?.expenseId || !data?.operationId) {
    throw new Error('E2E fixture returned incomplete settlement-reversal identifiers.');
  }
  return data;
}

async function purgeFixtureRun({
  runId = process.env.E2E_RUN_ID,
  workerId = process.env.E2E_WORKER_ID ?? 'worker-0',
  testKey,
} = {}) {
  if (!runId || !testKey) {
    throw new Error('purgeFixtureRun requires E2E_RUN_ID and a test key.');
  }

  const email = process.env.EXPO_PUBLIC_TEST_ACCOUNT_EMAIL;
  const password = process.env.EXPO_PUBLIC_TEST_ACCOUNT_OTP;
  if (!email || !password) {
    throw new Error('Run-scoped E2E fixtures require the configured development E2E account.');
  }

  const client = getFixtureClient();
  const { error: authError } = await client.auth.signInWithPassword({ email, password });
  if (authError) throw new Error(`E2E fixture authentication failed: ${authError.message}`);

  const { data, error } = await client.rpc('purge_e2e_fixture_run', {
    p_run_id: runId,
    p_worker_id: workerId,
    p_test_key: testKey,
  });
  if (error) throw new Error(`E2E fixture cleanup failed: ${error.message}`);
  return data;
}

async function seedFriendship({
  runId = process.env.E2E_RUN_ID,
  workerId = process.env.E2E_WORKER_ID ?? 'worker-0',
  testKey,
} = {}) {
  if (!runId || !testKey) {
    throw new Error('seedFriendship requires E2E_RUN_ID and a test key.');
  }

  const email = process.env.EXPO_PUBLIC_TEST_ACCOUNT_EMAIL;
  const password = process.env.EXPO_PUBLIC_TEST_ACCOUNT_OTP;
  if (!email || !password) {
    throw new Error('Run-scoped E2E fixtures require the configured development E2E account.');
  }

  const client = getFixtureClient();
  const { error: authError } = await client.auth.signInWithPassword({ email, password });
  if (authError) throw new Error(`E2E fixture authentication failed: ${authError.message}`);

  const { data, error } = await client.rpc('seed_e2e_friendship', {
    p_run_id: runId,
    p_worker_id: workerId,
    p_test_key: testKey,
  });
  if (error) throw new Error(`E2E fixture seeding failed: ${error.message}`);
  if (!data?.friendId || !data?.friendName || data.groupId || data.expenseId) {
    throw new Error('E2E fixture returned an incomplete friendship-only scenario.');
  }
  return data;
}

module.exports = {
  purgeFixtureRun,
  seedFriendship,
  seedGroupMembership,
  seedOutstandingGroup,
  seedSettlementReversal,
};
