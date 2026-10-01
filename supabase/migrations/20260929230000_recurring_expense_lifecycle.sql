-- Lifecycle hooks for recurring expense rules.
--
-- Account deletion stops future owned rules while preserving posted history.
-- Group deletion and friendship/membership changes automatically pause affected rules.

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
  app_user_id uuid;
  app_email text;
  member_group_ids uuid[];
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
    public.group_members, public.friendships, public.invitations,
    public.recurring_expense_rules
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

  -- Stop all future owned recurring expense rules.
  UPDATE public.recurring_expense_rules
  SET status = 'stopped',
      next_due_on = NULL,
      updated_at = now()
  WHERE owner_id = app_user_id
    AND status IN ('active', 'paused');

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

-- Pause recurring rules when their associated group is deleted.
CREATE OR REPLACE FUNCTION private.pause_rules_on_group_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    UPDATE public.recurring_expense_rules
    SET status = 'paused',
        paused_reason = 'The associated group has been deleted. Edit the rule or restore the group.',
        updated_at = now()
    WHERE group_id = NEW.id
      AND status = 'active';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pause_rules_on_group_deletion ON public.groups;
CREATE TRIGGER trg_pause_rules_on_group_deletion
  AFTER UPDATE OF deleted_at ON public.groups
  FOR EACH ROW
  EXECUTE FUNCTION private.pause_rules_on_group_deletion();

-- Pause direct recurring rules when friendship ends or is unaccepted.
CREATE OR REPLACE FUNCTION private.pause_rules_on_friendship_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  f_user1 uuid;
  f_user2 uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    f_user1 := OLD.user_id;
    f_user2 := OLD.friend_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'accepted' AND NEW.status <> 'accepted' THEN
      f_user1 := NEW.user_id;
      f_user2 := NEW.friend_id;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  UPDATE public.recurring_expense_rules r
  SET status = 'paused',
      paused_reason = 'A saved friendship is no longer accepted. Repair the friendship or edit this rule.',
      updated_at = now()
  WHERE r.scope_type = 'friends'
    AND r.status = 'active'
    AND (
      (r.owner_id = f_user1 AND EXISTS (SELECT 1 FROM public.recurring_expense_rule_participants p WHERE p.rule_id = r.id AND p.user_id = f_user2))
      OR
      (r.owner_id = f_user2 AND EXISTS (SELECT 1 FROM public.recurring_expense_rule_participants p WHERE p.rule_id = r.id AND p.user_id = f_user1))
    );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_pause_rules_on_friendship_change ON public.friendships;
CREATE TRIGGER trg_pause_rules_on_friendship_change
  AFTER DELETE OR UPDATE OF status ON public.friendships
  FOR EACH ROW
  EXECUTE FUNCTION private.pause_rules_on_friendship_change();

-- Pause group recurring rules when a participant is removed from the group.
CREATE OR REPLACE FUNCTION private.pause_rules_on_member_removal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  UPDATE public.recurring_expense_rules r
  SET status = 'paused',
      paused_reason = 'A saved participant is no longer a member of this group. Edit the rule to adjust participants.',
      updated_at = now()
  WHERE r.group_id = OLD.group_id
    AND r.status = 'active'
    AND (
      r.owner_id = OLD.user_id
      OR EXISTS (
        SELECT 1 FROM public.recurring_expense_rule_participants p
        WHERE p.rule_id = r.id AND p.user_id = OLD.user_id
      )
    );
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_pause_rules_on_member_removal ON public.group_members;
CREATE TRIGGER trg_pause_rules_on_member_removal
  AFTER DELETE ON public.group_members
  FOR EACH ROW
  EXECUTE FUNCTION private.pause_rules_on_member_removal();
