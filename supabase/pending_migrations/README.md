# Pending Migrations

This directory holds database migrations that are **under active development or pending deployment to Production**.

## Workflow

1. **Add new migration:** Place your `.sql` migration file in this directory:
   ```
   supabase/pending_migrations/YYYYMMDDHHMMSS_your_migration_name.sql
   ```
2. **Apply to Dev:**
   ```bash
   npm run db:migrate:dev
   ```
   This will apply the migration to the Dev database (configured via `SUPABASE_DEV_PROJECT_ID`). The file stays in this directory so it is clear that it has not yet been deployed to Production.
3. **Deploy to Prod:**
   When a release tag (e.g. `v1.2.3`) is pushed to GitHub, CI automatically:
   - Applies all pending migrations to Production (configured via `SUPABASE_PROD_PROJECT_ID`).
   - Moves the `.sql` files to `supabase/migrations/`.
   - Regenerates `types/supabase.ts`.
   - Commits the changes back to `master`.
