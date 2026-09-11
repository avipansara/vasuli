const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

// Promotes pending migrations from supabase/pending_migrations/ to Production:
// 1. Applies unapplied migrations to the Prod database.
// 2. Records versions in Prod schema_migrations.
// 3. Moves the .sql files to supabase/migrations/.
// 4. Regenerates types/supabase.ts from the updated Prod schema.
//
// Usage: SUPABASE_PROD_PROJECT_ID=<id> SUPABASE_ACCESS_TOKEN=<token> node scripts/promote-migrations.cjs
// Requires: SUPABASE_ACCESS_TOKEN and SUPABASE_PROD_PROJECT_ID

const PROD_PROJECT_ID = process.env.SUPABASE_PROD_PROJECT_ID;
const PENDING_DIR = path.resolve(__dirname, '../supabase/pending_migrations');
const MIGRATIONS_DIR = path.resolve(__dirname, '../supabase/migrations');
const TYPES_FILE = path.resolve(__dirname, '../types/supabase.ts');

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

function regenerateTypes(token, projectId) {
  const targetProject = projectId || process.env.SUPABASE_PROD_PROJECT_ID;
  if (!targetProject) {
    console.warn('Warning: Cannot regenerate types because SUPABASE_PROD_PROJECT_ID is not set.');
    return;
  }
  console.log(`Regenerating types/supabase.ts from Prod (${targetProject})...`);
  try {
    const output = execSync(
      `npx supabase gen types typescript --project-id ${targetProject}`,
      {
        env: { ...process.env, SUPABASE_ACCESS_TOKEN: token },
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
      }
    );
    if (output && output.trim().length > 0) {
      fs.writeFileSync(TYPES_FILE, output);
      console.log('✓ Successfully updated types/supabase.ts.');
    }
  } catch (err) {
    console.warn('Warning: Could not regenerate types via supabase CLI:', err.message);
  }
}

async function main() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    console.error('Error: SUPABASE_ACCESS_TOKEN is required to promote migrations to Production.');
    console.error('Set SUPABASE_ACCESS_TOKEN in your environment or CI secrets.');
    process.exit(1);
  }

  const projectId = process.env.SUPABASE_PROD_PROJECT_ID;
  if (!projectId) {
    console.error('Error: SUPABASE_PROD_PROJECT_ID is required to promote migrations to Production.');
    console.error('Set SUPABASE_PROD_PROJECT_ID in your environment or CI secrets.');
    process.exit(1);
  }

  const files = getPendingMigrationFiles();
  if (files.length === 0) {
    console.log('No pending migrations in supabase/pending_migrations/. Nothing to promote.');
    return;
  }

  console.log(`Found ${files.length} pending migration(s) to promote to Production (${projectId})...`);
  const appliedVersions = await getAppliedVersions(token, projectId);

  for (const file of files) {
    const version = extractVersion(file);
    const sourcePath = path.join(PENDING_DIR, file);
    const destPath = path.join(MIGRATIONS_DIR, file);

    if (!appliedVersions.has(version)) {
      console.log(`+ [Applying to Prod] ${file}...`);
      const sql = fs.readFileSync(sourcePath, 'utf8');

      const fullSql = `
        BEGIN;
        ${sql}
        INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('${version}') ON CONFLICT DO NOTHING;
        COMMIT;
      `;

      await executeQuery(fullSql, token, projectId);
      console.log(`✓ [Applied] ${file} successfully executed on Prod.`);
    } else {
      console.log(`- [Already Recorded on Prod] ${file}`);
    }

    // Move file to supabase/migrations/
    fs.renameSync(sourcePath, destPath);
    console.log(`→ [Moved] ${file} promoted to supabase/migrations/`);
  }

  regenerateTypes(token, projectId);
  console.log('Migration promotion to Production complete.');
}

if (require.main === module) {
  main().catch(err => {
    console.error('Migration promotion failed:', err);
    process.exit(1);
  });
}

module.exports = {
  getPendingMigrationFiles,
  extractVersion,
  PROD_PROJECT_ID,
  PENDING_DIR,
  MIGRATIONS_DIR,
};
