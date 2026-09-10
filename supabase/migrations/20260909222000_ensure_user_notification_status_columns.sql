-- The application and its read models already use these profile fields, but
-- older migration-only environments may not have them because they were
-- originally created outside the tracked migration chain.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS push_token text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
