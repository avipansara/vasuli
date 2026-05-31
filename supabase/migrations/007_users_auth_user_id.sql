-- Add a Supabase Auth link without changing existing public.users IDs.
-- Existing expenses, groups, friendships, and settlements continue to reference public.users.id.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_auth_user_id_key
  ON public.users(auth_user_id)
  WHERE auth_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_auth_user_id
  ON public.users(auth_user_id);

DROP POLICY IF EXISTS "Users can read own auth-linked profile" ON public.users;
CREATE POLICY "Users can read own auth-linked profile"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (auth_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update own auth-linked profile" ON public.users;
CREATE POLICY "Users can update own auth-linked profile"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (auth_user_id = (SELECT auth.uid()))
  WITH CHECK (auth_user_id = (SELECT auth.uid()));
