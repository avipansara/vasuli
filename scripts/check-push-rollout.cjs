// A new app stops client-side expense pushes, so do not submit it before activation.
async function main() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const project = process.env.SUPABASE_PROD_PROJECT_ID;
  if (!token || !project) throw new Error('Missing Supabase production credentials');
  const response = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'select enabled from private.push_notification_rollout where singleton' }),
  });
  if (!response.ok) throw new Error(`Could not check push rollout (${response.status})`);
  const result = await response.json();
  const rows = Array.isArray(result) ? result : result.result;
  if (!Array.isArray(rows) || rows[0]?.enabled !== true) {
    throw new Error('Push rollout is disabled. Deploy both push functions, configure the worker, and activate the rollout before submitting the app; see docs/push-notification-diagnostics.md.');
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
