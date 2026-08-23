-- Development SQL Editor setup for e2e-run-scoped-fixtures.sql.
-- Replace the placeholder before executing this file. Run only after
-- verifying that the SQL Editor is connected to the development project.

INSERT INTO public.e2e_fixture_settings (id, environment, enabled)
VALUES (true, 'development', true)
ON CONFLICT (id) DO UPDATE
SET environment = EXCLUDED.environment,
    enabled = EXCLUDED.enabled,
    updated_at = now();

SELECT public.configure_e2e_fixture_account('REPLACE_WITH_E2E_ACCOUNT_EMAIL');
