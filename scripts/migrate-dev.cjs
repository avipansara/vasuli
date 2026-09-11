const fs = require('node:fs');
const path = require('node:path');

// Applies pending migrations from supabase/pending_migrations/ to Dev.
// Files remain in supabase/pending_migrations/ so git clearly reflects that
// they have not yet been released to Production.
//
// Usage: SUPABASE_DEV_PROJECT_ID=<id> SUPABASE_ACCESS_TOKEN=<token> node scripts/migrate-dev.cjs
// Requires: SUPABASE_ACCESS_TOKEN and SUPABASE_DEV_PROJECT_ID

const DEV_PROJECT_ID = process.env.SUPABASE_DEV_PROJECT_ID;
const PENDING_DIR = path.resolve(__dirname, '../supabase/pending_migrations');

function getPendingMigrationFiles() {
  if (!fs.existsSync(PENDING_DIR)) return [];
  return fs.readdirSync(PENDING_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();
}

function extractVersion(filename) {
  const match = filename.match(/^(\d+)/);
  if (!match) {
    throw new Error(`Migration file "${filename}" must begin with a numeric timestamp (e.g. 20260912120000_name.sql)`);
  }
  return match[1];
}

async function executeQuery(sql, token, projectId) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectId}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Database query failed (${response.status}): ${errorText}`);
  }

  return response.json();
}

async function getAppliedVersions(token, projectId) {
  const query = 'SELECT version FROM supabase_migrations.schema_migrations;';
  const result = await executeQuery(query, token, projectId);
  const rows = Array.isArray(result) ? result : (result.result || []);
  return new Set(rows.map(r => String(r.version)));
}

async function main() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    console.error('Error: SUPABASE_ACCESS_TOKEN is required to run migrations.');
    console.error('Set SUPABASE_ACCESS_TOKEN in your environment or CI secrets.');
    process.exit(1);
  }

  const projectId = process.env.SUPABASE_DEV_PROJECT_ID;
  if (!projectId) {
    console.error('Error: SUPABASE_DEV_PROJECT_ID is required to run migrations.');
    console.error('Set SUPABASE_DEV_PROJECT_ID in your environment or CI secrets.');
    process.exit(1);
  }

  const files = getPendingMigrationFiles();
  if (files.length === 0) {
    console.log('No pending migrations found in supabase/pending_migrations/. Nothing to apply.');
    return;
  }

  console.log(`Found ${files.length} pending migration file(s). Checking Dev database (${projectId})...`);
  const appliedVersions = await getAppliedVersions(token, projectId);

  let appliedCount = 0;
  for (const file of files) {
    const version = extractVersion(file);
    if (appliedVersions.has(version)) {
      console.log(`- [Already Applied] ${file}`);
      continue;
    }

    console.log(`+ [Applying to Dev] ${file}...`);
    const filePath = path.join(PENDING_DIR, file);
    const sql = fs.readFileSync(filePath, 'utf8');

    // Run migration and record in schema_migrations atomically
    const fullSql = `
      BEGIN;
      ${sql}
      INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('${version}') ON CONFLICT DO NOTHING;
      COMMIT;
    `;

    await executeQuery(fullSql, token, projectId);
    console.log(`✓ [Success] ${file} applied to Dev.`);
    appliedCount++;
  }

  if (appliedCount === 0) {
    console.log('All pending migrations are already applied to Dev.');
  } else {
    console.log(`Successfully applied ${appliedCount} migration(s) to Dev.`);
  }
  console.log('Note: Files remain in supabase/pending_migrations/ until released to Prod on tag creation.');
}

if (require.main === module) {
  main().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}

module.exports = {
  getPendingMigrationFiles,
  extractVersion,
  DEV_PROJECT_ID,
  PENDING_DIR,
};
