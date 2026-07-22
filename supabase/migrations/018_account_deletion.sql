-- Account deletion keeps shared financial records intact while removing the
-- user's direct identity and social relationships.

CREATE OR REPLACE FUNCTION public.delete_account_data(
  target_auth_user_id uuid,
  target_email text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  app_user_id text;
  app_email text;
  member_group_ids text[];
  outstanding_balance_count integer;
BEGIN
  SELECT id, email
  INTO app_user_id, app_email
  FROM public.users
  WHERE auth_user_id = target_auth_user_id
     OR (
       target_email IS NOT NULL
       AND lower(btrim(email)) = lower(btrim(target_email))
     )
  ORDER BY (auth_user_id = target_auth_user_id) DESC
  LIMIT 1
  FOR UPDATE;

  IF app_user_id IS NULL THEN
    RAISE EXCEPTION 'Account profile not found';
  END IF;

  app_email := COALESCE(app_email, target_email);

  -- Account deletion is rare, so briefly serialize writes to the financial
  -- and membership tables. This prevents a new expense or settlement from
  -- being created between the balance check and anonymization.
  LOCK TABLE public.expenses, public.expense_splits, public.settlements,
    public.group_members, public.friendships, public.invitations
    IN SHARE ROW EXCLUSIVE MODE;

  -- Account deletion must not strand an unsettled debt. Calculate the
  -- deleting user's net balance independently for every group/currency pair
  -- (and for ungrouped expenses) so currencies are never mixed together.
  WITH balance_entries AS (
    SELECT e.group_id, e.currency, e.amount AS balance
    FROM public.expenses e
    WHERE e.paid_by = app_user_id
    UNION ALL
    SELECT e.group_id, e.currency, -es.amount AS balance
    FROM public.expenses e
    JOIN public.expense_splits es ON es.expense_id = e.id
    WHERE es.user_id = app_user_id
    UNION ALL
    SELECT s.group_id, s.currency, s.amount AS balance
    FROM public.settlements s
    WHERE s.from_user_id = app_user_id
    UNION ALL
    SELECT s.group_id, s.currency, -s.amount AS balance
    FROM public.settlements s
    WHERE s.to_user_id = app_user_id
  ), grouped_balances AS (
    SELECT group_id, currency, SUM(balance) AS balance
    FROM balance_entries
    GROUP BY group_id, currency
  )
  SELECT COUNT(*)
  INTO outstanding_balance_count
  FROM grouped_balances
  WHERE ABS(balance) >= 0.01;

  IF outstanding_balance_count > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'ACCOUNT_HAS_OUTSTANDING_BALANCES',
      DETAIL = 'Settle all balances before deleting this account.';
  END IF;

  DELETE FROM public.activities
  WHERE user_id = app_user_id;

  DELETE FROM public.friendships
  WHERE user_id = app_user_id
     OR friend_id = app_user_id;

  DELETE FROM public.invitations
  WHERE inviter_id = app_user_id
     OR (
       app_email IS NOT NULL
       AND lower(invitee_email) = lower(app_email)
     );

  SELECT COALESCE(array_agg(group_id), '{}')
  INTO member_group_ids
  FROM public.group_members
  WHERE user_id = app_user_id;

  DELETE FROM public.group_members
  WHERE user_id = app_user_id;

  -- Preserve remaining groups by ensuring every group still has an admin.
  UPDATE public.group_members member
  SET role = 'admin'
  WHERE member.group_id = ANY(member_group_ids)
    AND member.role <> 'admin'
    AND NOT EXISTS (
      SELECT 1
      FROM public.group_members admin_member
      WHERE admin_member.group_id = member.group_id
        AND admin_member.role = 'admin'
    )
    AND member.id = (
      SELECT replacement.id
      FROM public.group_members replacement
      WHERE replacement.group_id = member.group_id
      ORDER BY replacement.joined_at, replacement.id
      LIMIT 1
    );

  -- Keep groups and shared financial records intact, including groups that
  -- become empty. This avoids cascading away historical expenses/settlements
  -- during account deletion. Empty groups are no longer visible to members,
  -- but remain available for retention/support workflows.

  -- Keep shared expenses/splits/settlements for the other participants, but
  -- remove the account's personal identity. The auth linkage is cleared when
  -- the Edge Function deletes the corresponding auth.users row.
  UPDATE public.users
  SET name = 'Deleted User',
      email = NULL,
      phone = NULL,
      avatar = NULL,
      push_token = NULL,
      is_active = FALSE
  WHERE id = app_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_account_data(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_account_data(uuid, text) TO service_role;
