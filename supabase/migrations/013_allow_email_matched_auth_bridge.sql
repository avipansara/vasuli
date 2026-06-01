-- Strict RLS compatibility for legacy public user rows.
--
-- The app keeps historical foreign keys pointed at public.users.id. Some
-- legacy installs can hold a public user ID whose email matches the Supabase
-- Auth JWT, even if auth_user_id resolution picks a different row. This remains
-- JWT-backed authorization, but permits acting as a public user row with the
-- same normalized email as the signed-in Supabase Auth user.

CREATE OR REPLACE FUNCTION private.can_act_as_user(target_user_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id::text = target_user_id
      AND (
        u.auth_user_id = (SELECT auth.uid())
        OR lower(btrim(u.email)) = private.current_app_user_email()
      )
  )
$$;

CREATE OR REPLACE FUNCTION private.is_group_member(target_group_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_members gm
    WHERE gm.group_id::text = target_group_id
      AND private.can_act_as_user(gm.user_id::text)
  )
$$;

CREATE OR REPLACE FUNCTION private.is_group_admin(target_group_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_members gm
    WHERE gm.group_id::text = target_group_id
      AND private.can_act_as_user(gm.user_id::text)
      AND gm.role = 'admin'
  )
$$;

CREATE OR REPLACE FUNCTION private.is_expense_payer(target_expense_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.expenses e
    WHERE e.id::text = target_expense_id
      AND private.can_act_as_user(e.paid_by::text)
  )
$$;

CREATE OR REPLACE FUNCTION private.can_view_expense(target_expense_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.expenses e
    WHERE e.id::text = target_expense_id
      AND (
        private.can_act_as_user(e.paid_by::text)
        OR (
          e.group_id IS NOT NULL
          AND private.is_group_member(e.group_id::text)
        )
        OR EXISTS (
          SELECT 1
          FROM public.expense_splits es
          WHERE es.expense_id::text = e.id::text
            AND private.can_act_as_user(es.user_id::text)
        )
      )
  )
$$;

DROP POLICY IF EXISTS "expenses_insert_payer_authenticated" ON public.expenses;
DROP POLICY IF EXISTS "expenses_update_payer_authenticated" ON public.expenses;
DROP POLICY IF EXISTS "expenses_delete_payer_authenticated" ON public.expenses;

CREATE POLICY "expenses_insert_payer_authenticated"
ON public.expenses
FOR INSERT
TO authenticated
WITH CHECK (
  private.can_act_as_user(paid_by::text)
  AND (
    group_id IS NULL
    OR private.is_group_member(group_id::text)
  )
);

CREATE POLICY "expenses_update_payer_authenticated"
ON public.expenses
FOR UPDATE
TO authenticated
USING (private.can_act_as_user(paid_by::text))
WITH CHECK (
  private.can_act_as_user(paid_by::text)
  AND (
    group_id IS NULL
    OR private.is_group_member(group_id::text)
  )
);

CREATE POLICY "expenses_delete_payer_authenticated"
ON public.expenses
FOR DELETE
TO authenticated
USING (private.can_act_as_user(paid_by::text));

DROP POLICY IF EXISTS "group_members_select_member_authenticated" ON public.group_members;
DROP POLICY IF EXISTS "group_members_insert_admin_or_self_authenticated" ON public.group_members;
DROP POLICY IF EXISTS "group_members_delete_admin_or_self_authenticated" ON public.group_members;

CREATE POLICY "group_members_select_member_authenticated"
ON public.group_members
FOR SELECT
TO authenticated
USING (
  private.can_act_as_user(user_id::text)
  OR private.is_group_member(group_id::text)
);

CREATE POLICY "group_members_insert_admin_or_self_authenticated"
ON public.group_members
FOR INSERT
TO authenticated
WITH CHECK (
  private.current_app_user_id() IS NOT NULL
  AND (
    private.is_group_admin(group_id::text)
    OR (
      private.can_act_as_user(user_id::text)
      AND NOT private.group_has_members(group_id::text)
    )
  )
);

CREATE POLICY "group_members_delete_admin_or_self_authenticated"
ON public.group_members
FOR DELETE
TO authenticated
USING (
  private.can_act_as_user(user_id::text)
  OR private.is_group_admin(group_id::text)
);

DROP POLICY IF EXISTS "friendships_insert_requester_authenticated" ON public.friendships;
DROP POLICY IF EXISTS "friendships_select_participant_authenticated" ON public.friendships;
DROP POLICY IF EXISTS "friendships_update_participant_authenticated" ON public.friendships;
DROP POLICY IF EXISTS "friendships_delete_participant_authenticated" ON public.friendships;

CREATE POLICY "friendships_select_participant_authenticated"
ON public.friendships
FOR SELECT
TO authenticated
USING (
  private.can_act_as_user(user_id::text)
  OR private.can_act_as_user(friend_id::text)
);

CREATE POLICY "friendships_insert_requester_authenticated"
ON public.friendships
FOR INSERT
TO authenticated
WITH CHECK (private.can_act_as_user(user_id::text));

CREATE POLICY "friendships_update_participant_authenticated"
ON public.friendships
FOR UPDATE
TO authenticated
USING (
  private.can_act_as_user(user_id::text)
  OR private.can_act_as_user(friend_id::text)
)
WITH CHECK (
  private.can_act_as_user(user_id::text)
  OR private.can_act_as_user(friend_id::text)
);

CREATE POLICY "friendships_delete_participant_authenticated"
ON public.friendships
FOR DELETE
TO authenticated
USING (
  private.can_act_as_user(user_id::text)
  OR private.can_act_as_user(friend_id::text)
);

REVOKE ALL ON FUNCTION private.can_act_as_user(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_act_as_user(text) TO authenticated;
