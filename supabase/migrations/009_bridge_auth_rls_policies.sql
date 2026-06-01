-- Rebuild public table RLS around Supabase Auth sessions.
--
-- The app still stores domain user IDs in public.users.id. Supabase Auth stores
-- session user IDs in auth.users.id, linked through public.users.auth_user_id.
-- These policies authorize authenticated requests by first resolving the app
-- user ID from auth.uid(), while preserving explicit anon policies for the
-- current transition release.

CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.current_app_user_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id::text
  FROM public.users u
  WHERE u.auth_user_id = (SELECT auth.uid())
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION private.current_app_user_email()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT lower(btrim(u.email))
      FROM public.users u
      WHERE u.auth_user_id = (SELECT auth.uid())
      LIMIT 1
    ),
    lower(btrim((SELECT auth.jwt() ->> 'email')))
  )
$$;

CREATE OR REPLACE FUNCTION private.group_has_members(target_group_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_members gm
    WHERE gm.group_id::text = target_group_id
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
      AND gm.user_id::text = private.current_app_user_id()
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
      AND gm.user_id::text = private.current_app_user_id()
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
      AND e.paid_by::text = private.current_app_user_id()
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
        e.paid_by::text = private.current_app_user_id()
        OR (
          e.group_id IS NOT NULL
          AND private.is_group_member(e.group_id::text)
        )
        OR EXISTS (
          SELECT 1
          FROM public.expense_splits es
          WHERE es.expense_id::text = e.id::text
            AND es.user_id::text = private.current_app_user_id()
        )
      )
  )
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO authenticated;

DO $$
DECLARE
  policy_record record;
BEGIN
  FOR policy_record IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY (ARRAY[
        'users',
        'groups',
        'group_members',
        'expenses',
        'expense_splits',
        'settlements',
        'friendships',
        'invitations',
        'activities'
      ])
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  END LOOP;
END;
$$;

-- Transitional anon policies. These preserve the legacy custom-OTP app paths
-- while authenticated access is moved onto JWT-backed authorization.
CREATE POLICY "users_all_anon"
ON public.users
FOR ALL
TO anon
USING (true)
WITH CHECK (true);

CREATE POLICY "groups_all_anon"
ON public.groups
FOR ALL
TO anon
USING (true)
WITH CHECK (true);

CREATE POLICY "group_members_all_anon"
ON public.group_members
FOR ALL
TO anon
USING (true)
WITH CHECK (true);

CREATE POLICY "expenses_all_anon"
ON public.expenses
FOR ALL
TO anon
USING (true)
WITH CHECK (true);

CREATE POLICY "expense_splits_all_anon"
ON public.expense_splits
FOR ALL
TO anon
USING (true)
WITH CHECK (true);

CREATE POLICY "settlements_all_anon"
ON public.settlements
FOR ALL
TO anon
USING (true)
WITH CHECK (true);

CREATE POLICY "friendships_all_anon"
ON public.friendships
FOR ALL
TO anon
USING (true)
WITH CHECK (true);

CREATE POLICY "invitations_all_anon"
ON public.invitations
FOR ALL
TO anon
USING (true)
WITH CHECK (true);

CREATE POLICY "activities_select_anon"
ON public.activities
FOR SELECT
TO anon
USING (true);

CREATE POLICY "activities_insert_anon"
ON public.activities
FOR INSERT
TO anon
WITH CHECK (true);

-- Authenticated profile policies.
CREATE POLICY "users_select_authenticated"
ON public.users
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "users_insert_authenticated"
ON public.users
FOR INSERT
TO authenticated
WITH CHECK (auth_user_id = (SELECT auth.uid()));

CREATE POLICY "users_update_self_authenticated"
ON public.users
FOR UPDATE
TO authenticated
USING (
  id::text = private.current_app_user_id()
  OR (
    auth_user_id IS NULL
    AND lower(btrim(email)) = private.current_app_user_email()
  )
)
WITH CHECK (
  auth_user_id = (SELECT auth.uid())
  AND (
    id::text = private.current_app_user_id()
    OR lower(btrim(email)) = private.current_app_user_email()
  )
);

-- Groups and memberships.
CREATE POLICY "groups_select_member_authenticated"
ON public.groups
FOR SELECT
TO authenticated
USING (private.current_app_user_id() IS NOT NULL);

CREATE POLICY "groups_insert_authenticated"
ON public.groups
FOR INSERT
TO authenticated
WITH CHECK (private.current_app_user_id() IS NOT NULL);

CREATE POLICY "groups_update_admin_authenticated"
ON public.groups
FOR UPDATE
TO authenticated
USING (private.is_group_admin(id::text))
WITH CHECK (private.is_group_admin(id::text));

CREATE POLICY "groups_delete_admin_authenticated"
ON public.groups
FOR DELETE
TO authenticated
USING (private.is_group_admin(id::text));

CREATE POLICY "group_members_select_member_authenticated"
ON public.group_members
FOR SELECT
TO authenticated
USING (
  user_id::text = private.current_app_user_id()
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
      user_id::text = private.current_app_user_id()
      AND NOT private.group_has_members(group_id::text)
    )
  )
);

CREATE POLICY "group_members_update_admin_authenticated"
ON public.group_members
FOR UPDATE
TO authenticated
USING (private.is_group_admin(group_id::text))
WITH CHECK (private.is_group_admin(group_id::text));

CREATE POLICY "group_members_delete_admin_or_self_authenticated"
ON public.group_members
FOR DELETE
TO authenticated
USING (
  user_id::text = private.current_app_user_id()
  OR private.is_group_admin(group_id::text)
);

-- Expenses and splits.
CREATE POLICY "expenses_select_authenticated"
ON public.expenses
FOR SELECT
TO authenticated
USING (private.can_view_expense(id::text));

CREATE POLICY "expenses_insert_payer_authenticated"
ON public.expenses
FOR INSERT
TO authenticated
WITH CHECK (
  paid_by::text = private.current_app_user_id()
  AND (
    group_id IS NULL
    OR private.is_group_member(group_id::text)
  )
);

CREATE POLICY "expenses_update_payer_authenticated"
ON public.expenses
FOR UPDATE
TO authenticated
USING (paid_by::text = private.current_app_user_id())
WITH CHECK (
  paid_by::text = private.current_app_user_id()
  AND (
    group_id IS NULL
    OR private.is_group_member(group_id::text)
  )
);

CREATE POLICY "expenses_delete_payer_authenticated"
ON public.expenses
FOR DELETE
TO authenticated
USING (paid_by::text = private.current_app_user_id());

CREATE POLICY "expense_splits_select_authenticated"
ON public.expense_splits
FOR SELECT
TO authenticated
USING (private.can_view_expense(expense_id::text));

CREATE POLICY "expense_splits_insert_payer_authenticated"
ON public.expense_splits
FOR INSERT
TO authenticated
WITH CHECK (private.is_expense_payer(expense_id::text));

CREATE POLICY "expense_splits_update_payer_authenticated"
ON public.expense_splits
FOR UPDATE
TO authenticated
USING (private.is_expense_payer(expense_id::text))
WITH CHECK (private.is_expense_payer(expense_id::text));

CREATE POLICY "expense_splits_delete_payer_authenticated"
ON public.expense_splits
FOR DELETE
TO authenticated
USING (private.is_expense_payer(expense_id::text));

-- Settlements.
CREATE POLICY "settlements_select_authenticated"
ON public.settlements
FOR SELECT
TO authenticated
USING (
  from_user_id::text = private.current_app_user_id()
  OR to_user_id::text = private.current_app_user_id()
  OR (
    group_id IS NOT NULL
    AND private.is_group_member(group_id::text)
  )
);

CREATE POLICY "settlements_insert_participant_authenticated"
ON public.settlements
FOR INSERT
TO authenticated
WITH CHECK (
  (
    from_user_id::text = private.current_app_user_id()
    OR to_user_id::text = private.current_app_user_id()
  )
  AND (
    group_id IS NULL
    OR private.is_group_member(group_id::text)
  )
);

CREATE POLICY "settlements_update_participant_authenticated"
ON public.settlements
FOR UPDATE
TO authenticated
USING (
  from_user_id::text = private.current_app_user_id()
  OR to_user_id::text = private.current_app_user_id()
  OR (
    group_id IS NOT NULL
    AND private.is_group_admin(group_id::text)
  )
)
WITH CHECK (
  from_user_id::text = private.current_app_user_id()
  OR to_user_id::text = private.current_app_user_id()
  OR (
    group_id IS NOT NULL
    AND private.is_group_admin(group_id::text)
  )
);

CREATE POLICY "settlements_delete_participant_authenticated"
ON public.settlements
FOR DELETE
TO authenticated
USING (
  from_user_id::text = private.current_app_user_id()
  OR to_user_id::text = private.current_app_user_id()
  OR (
    group_id IS NOT NULL
    AND private.is_group_admin(group_id::text)
  )
);

-- Friendships.
CREATE POLICY "friendships_select_participant_authenticated"
ON public.friendships
FOR SELECT
TO authenticated
USING (
  user_id::text = private.current_app_user_id()
  OR friend_id::text = private.current_app_user_id()
);

CREATE POLICY "friendships_insert_requester_authenticated"
ON public.friendships
FOR INSERT
TO authenticated
WITH CHECK (user_id::text = private.current_app_user_id());

CREATE POLICY "friendships_update_participant_authenticated"
ON public.friendships
FOR UPDATE
TO authenticated
USING (
  user_id::text = private.current_app_user_id()
  OR friend_id::text = private.current_app_user_id()
)
WITH CHECK (
  user_id::text = private.current_app_user_id()
  OR friend_id::text = private.current_app_user_id()
);

CREATE POLICY "friendships_delete_participant_authenticated"
ON public.friendships
FOR DELETE
TO authenticated
USING (
  user_id::text = private.current_app_user_id()
  OR friend_id::text = private.current_app_user_id()
);

-- Invitations.
CREATE POLICY "invitations_select_participant_authenticated"
ON public.invitations
FOR SELECT
TO authenticated
USING (
  inviter_id::text = private.current_app_user_id()
  OR lower(btrim(invitee_email)) = private.current_app_user_email()
);

CREATE POLICY "invitations_insert_inviter_authenticated"
ON public.invitations
FOR INSERT
TO authenticated
WITH CHECK (inviter_id::text = private.current_app_user_id());

CREATE POLICY "invitations_update_participant_authenticated"
ON public.invitations
FOR UPDATE
TO authenticated
USING (
  inviter_id::text = private.current_app_user_id()
  OR lower(btrim(invitee_email)) = private.current_app_user_email()
)
WITH CHECK (
  inviter_id::text = private.current_app_user_id()
  OR lower(btrim(invitee_email)) = private.current_app_user_email()
);

CREATE POLICY "invitations_delete_participant_authenticated"
ON public.invitations
FOR DELETE
TO authenticated
USING (
  inviter_id::text = private.current_app_user_id()
  OR lower(btrim(invitee_email)) = private.current_app_user_email()
);

-- Activity feed.
CREATE POLICY "activities_select_authenticated"
ON public.activities
FOR SELECT
TO authenticated
USING (
  user_id::text = private.current_app_user_id()
  OR (
    group_id IS NOT NULL
    AND private.is_group_member(group_id::text)
  )
  OR (
    target_id IS NOT NULL
    AND private.can_view_expense(target_id::text)
  )
);

CREATE POLICY "activities_insert_authenticated"
ON public.activities
FOR INSERT
TO authenticated
WITH CHECK (
  user_id::text = private.current_app_user_id()
  OR (
    group_id IS NOT NULL
    AND private.is_group_member(group_id::text)
  )
);

CREATE POLICY "activities_delete_authenticated"
ON public.activities
FOR DELETE
TO authenticated
USING (
  user_id::text = private.current_app_user_id()
  OR (
    group_id IS NOT NULL
    AND private.is_group_admin(group_id::text)
  )
);
