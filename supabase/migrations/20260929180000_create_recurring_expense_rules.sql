-- Store recurring expense instructions and the participant split snapshot.
-- A rule has no effect on balances until a trusted worker creates an expense.

CREATE TABLE public.recurring_expense_rules (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  scope_type text NOT NULL CHECK (scope_type IN ('group', 'friends')),
  group_id uuid REFERENCES public.groups(id) ON DELETE RESTRICT,
  description text NOT NULL CHECK (btrim(description) <> ''),
  amount numeric(10, 2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  paid_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  -- split_method preserves what the owner selected in Add Expense. split_type
  -- records how posted expense_splits are represented (for example, Shares
  -- resolves to exact amount rows).
  split_method text NOT NULL CHECK (split_method IN ('equal', 'unequal', 'percentage', 'shares')),
  split_type text NOT NULL CHECK (split_type IN ('equal', 'exact', 'percentage')),
  cadence text NOT NULL CHECK (cadence IN ('weekly', 'monthly')),
  anchor_day smallint NOT NULL,
  time_zone text NOT NULL,
  first_due_on date NOT NULL,
  next_due_on date,
  last_due_on date,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'stopped', 'ended')),
  paused_reason text,
  last_error text,
  last_error_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recurring_expense_rules_scope_check CHECK (
    (scope_type = 'group' AND group_id IS NOT NULL)
    OR (scope_type = 'friends' AND group_id IS NULL)
  ),
  CONSTRAINT recurring_expense_rules_split_mapping_check CHECK (
    (split_method = 'equal' AND split_type = 'equal')
    OR (split_method IN ('unequal', 'shares') AND split_type = 'exact')
    OR (split_method = 'percentage' AND split_type = 'percentage')
  ),
  CONSTRAINT recurring_expense_rules_owner_payer_check CHECK (
    (owner_id IS NULL AND paid_by IS NULL) OR owner_id = paid_by
  ),
  CONSTRAINT recurring_expense_rules_owner_required_check CHECK (
    owner_id IS NOT NULL OR status IN ('stopped', 'ended')
  ),
  CONSTRAINT recurring_expense_rules_anchor_check CHECK (
    (cadence = 'weekly' AND anchor_day BETWEEN 0 AND 6)
    OR (cadence = 'monthly' AND anchor_day BETWEEN 1 AND 31)
  ),
  CONSTRAINT recurring_expense_rules_dates_check CHECK (
    (next_due_on IS NULL OR next_due_on >= first_due_on)
    AND (last_due_on IS NULL OR last_due_on >= first_due_on)
    AND (last_due_on IS NULL OR next_due_on IS NULL OR next_due_on <= last_due_on)
  ),
  CONSTRAINT recurring_expense_rules_terminal_next_due_check CHECK (
    (status IN ('stopped', 'ended') AND next_due_on IS NULL)
    OR (status IN ('active', 'paused') AND next_due_on IS NOT NULL)
  )
);

CREATE TABLE public.recurring_expense_rule_participants (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  rule_id uuid NOT NULL REFERENCES public.recurring_expense_rules(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  share_amount numeric(10, 2) NOT NULL CHECK (share_amount >= 0),
  percentage numeric(5, 2) CHECK (percentage BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recurring_expense_rule_participants_unique UNIQUE (rule_id, user_id)
);

ALTER TABLE public.expenses
  ADD COLUMN recurring_rule_id uuid,
  ADD COLUMN scheduled_for date,
  ADD CONSTRAINT expenses_recurring_provenance_pair_check CHECK (
    (recurring_rule_id IS NULL AND scheduled_for IS NULL)
    OR (recurring_rule_id IS NOT NULL AND scheduled_for IS NOT NULL)
  ),
  ADD CONSTRAINT expenses_recurring_rule_id_fkey
    FOREIGN KEY (recurring_rule_id)
    REFERENCES public.recurring_expense_rules(id)
    ON DELETE RESTRICT;

-- This remains unique for soft-deleted expenses: deleting an occurrence does
-- not make its scheduled date available for a second posting.
CREATE UNIQUE INDEX expenses_recurring_occurrence_unique
  ON public.expenses(recurring_rule_id, scheduled_for)
  WHERE recurring_rule_id IS NOT NULL;

CREATE INDEX recurring_expense_rules_due_active_idx
  ON public.recurring_expense_rules(next_due_on, time_zone)
  WHERE status = 'active' AND next_due_on IS NOT NULL;

CREATE INDEX recurring_expense_rules_owner_list_idx
  ON public.recurring_expense_rules(owner_id, status, next_due_on);

CREATE INDEX recurring_expense_rules_participant_list_idx
  ON public.recurring_expense_rule_participants(user_id, rule_id);

CREATE INDEX recurring_expense_rules_group_scope_idx
  ON public.recurring_expense_rules(group_id)
  WHERE group_id IS NOT NULL;

CREATE OR REPLACE FUNCTION private.validate_recurring_rule_time_zone()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_timezone_names z WHERE z.name = NEW.time_zone
  ) THEN
    RAISE EXCEPTION 'Unknown time zone: %', NEW.time_zone
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER recurring_expense_rules_validate_time_zone
  BEFORE INSERT OR UPDATE OF time_zone ON public.recurring_expense_rules
  FOR EACH ROW EXECUTE FUNCTION private.validate_recurring_rule_time_zone();

CREATE OR REPLACE FUNCTION private.validate_recurring_rule_split(target_rule_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
SET row_security = off
AS $$
DECLARE
  rule_row public.recurring_expense_rules%ROWTYPE;
  participant_count bigint;
  shares_total numeric;
  percentages_total numeric;
  percentages_count bigint;
  owner_is_participant boolean;
BEGIN
  SELECT * INTO rule_row
  FROM public.recurring_expense_rules
  WHERE id = target_rule_id;

  -- The deferred child trigger can run after a parent row is cascaded away.
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT count(*), COALESCE(sum(share_amount), 0),
         COALESCE(sum(percentage), 0), count(percentage)
  INTO participant_count, shares_total, percentages_total, percentages_count
  FROM public.recurring_expense_rule_participants
  WHERE rule_id = target_rule_id;

  SELECT EXISTS (
    SELECT 1
    FROM public.recurring_expense_rule_participants p
    WHERE p.rule_id = target_rule_id AND p.user_id = rule_row.owner_id
  ) INTO owner_is_participant;

  IF participant_count = 0 OR shares_total <> rule_row.amount THEN
    RAISE EXCEPTION 'Recurring expense shares must total the rule amount'
      USING ERRCODE = '23514';
  END IF;

  IF rule_row.scope_type = 'friends'
    AND (participant_count < 2 OR NOT owner_is_participant) THEN
    RAISE EXCEPTION 'Direct friend rules must include the owner and at least one friend'
      USING ERRCODE = '23514';
  END IF;

  IF rule_row.split_type = 'percentage' THEN
    IF percentages_count <> participant_count OR percentages_total <> 100 THEN
      RAISE EXCEPTION 'Recurring expense percentages must total 100'
        USING ERRCODE = '23514';
    END IF;
  ELSIF percentages_count <> 0 THEN
    RAISE EXCEPTION 'Only percentage splits may store percentages'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.check_recurring_rule_split_constraint()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
SET row_security = off
AS $$
BEGIN
  IF TG_TABLE_NAME = 'recurring_expense_rules' THEN
    IF TG_OP <> 'DELETE' THEN
      PERFORM private.validate_recurring_rule_split(NEW.id);
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM private.validate_recurring_rule_split(OLD.rule_id);
  ELSE
    PERFORM private.validate_recurring_rule_split(NEW.rule_id);
    IF TG_OP = 'UPDATE' AND NEW.rule_id IS DISTINCT FROM OLD.rule_id THEN
      PERFORM private.validate_recurring_rule_split(OLD.rule_id);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER recurring_expense_rules_split_constraint
  AFTER INSERT OR UPDATE ON public.recurring_expense_rules
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION private.check_recurring_rule_split_constraint();

CREATE CONSTRAINT TRIGGER recurring_expense_rule_participants_split_constraint
  AFTER INSERT OR UPDATE OR DELETE ON public.recurring_expense_rule_participants
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION private.check_recurring_rule_split_constraint();

CREATE OR REPLACE FUNCTION private.prevent_recurring_rule_identity_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id
    OR NEW.paid_by IS DISTINCT FROM OLD.paid_by
    OR NEW.currency IS DISTINCT FROM OLD.currency THEN
    -- Account deletion first stops the schedule; SET NULL then preserves its
    -- historical rule without retaining a deleted user reference.
    IF NOT (
      OLD.status IN ('stopped', 'ended')
      AND NEW.status IN ('stopped', 'ended')
      AND NEW.owner_id IS NULL
      AND NEW.paid_by IS NULL
      AND NEW.currency = OLD.currency
    ) THEN
      RAISE EXCEPTION 'Recurring expense owner, payer, and currency cannot be changed'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER recurring_expense_rules_identity_immutable
  BEFORE UPDATE ON public.recurring_expense_rules
  FOR EACH ROW EXECUTE FUNCTION private.prevent_recurring_rule_identity_change();

CREATE OR REPLACE FUNCTION private.guard_expense_recurring_provenance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  claim_role text := current_setting('request.jwt.claim.role', true);
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.recurring_rule_id IS NOT NULL
      AND claim_role IS DISTINCT FROM 'service_role'
      AND current_user <> 'service_role' THEN
      RAISE EXCEPTION 'Only the trusted worker may create recurring occurrences'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.recurring_rule_id IS DISTINCT FROM OLD.recurring_rule_id
    OR NEW.scheduled_for IS DISTINCT FROM OLD.scheduled_for THEN
    RAISE EXCEPTION 'Recurring expense provenance cannot be changed'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER expenses_guard_recurring_provenance
  BEFORE INSERT OR UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION private.guard_expense_recurring_provenance();

ALTER TABLE public.recurring_expense_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_expense_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_expense_rule_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_expense_rule_participants FORCE ROW LEVEL SECURITY;

CREATE POLICY recurring_expense_rules_owner_select
  ON public.recurring_expense_rules FOR SELECT TO authenticated
  USING (private.can_act_as_user(owner_id::text));

CREATE POLICY recurring_expense_rules_owner_insert
  ON public.recurring_expense_rules FOR INSERT TO authenticated
  WITH CHECK (
    private.can_act_as_user(owner_id::text)
    AND private.can_act_as_user(paid_by::text)
  );

CREATE POLICY recurring_expense_rules_owner_update
  ON public.recurring_expense_rules FOR UPDATE TO authenticated
  USING (private.can_act_as_user(owner_id::text))
  WITH CHECK (
    private.can_act_as_user(owner_id::text)
    AND private.can_act_as_user(paid_by::text)
  );

CREATE POLICY recurring_expense_rule_participants_owner_select
  ON public.recurring_expense_rule_participants FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.recurring_expense_rules r
    WHERE r.id = rule_id AND private.can_act_as_user(r.owner_id::text)
  ));

CREATE POLICY recurring_expense_rule_participants_self_select
  ON public.recurring_expense_rule_participants FOR SELECT TO authenticated
  USING (private.can_act_as_user(user_id::text));

CREATE POLICY recurring_expense_rule_participants_owner_insert
  ON public.recurring_expense_rule_participants FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.recurring_expense_rules r
    WHERE r.id = rule_id AND private.can_act_as_user(r.owner_id::text)
  ));

CREATE POLICY recurring_expense_rule_participants_owner_update
  ON public.recurring_expense_rule_participants FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.recurring_expense_rules r
    WHERE r.id = rule_id AND private.can_act_as_user(r.owner_id::text)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.recurring_expense_rules r
    WHERE r.id = rule_id AND private.can_act_as_user(r.owner_id::text)
  ));

CREATE POLICY recurring_expense_rule_participants_owner_delete
  ON public.recurring_expense_rule_participants FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.recurring_expense_rules r
    WHERE r.id = rule_id AND private.can_act_as_user(r.owner_id::text)
  ));

-- A participant can read only their own share and the schedule/expense
-- metadata needed to understand what the rule will post. View-owner execution
-- bypasses the base-table RLS; the explicit bridged identity predicate is the
-- authorization boundary and the selected column list is the disclosure cap.
CREATE VIEW public.recurring_expense_rule_shares AS
SELECT
  r.id AS rule_id,
  r.scope_type,
  r.group_id,
  r.description,
  r.amount,
  r.currency,
  r.paid_by,
  r.split_method,
  r.split_type,
  r.cadence,
  r.anchor_day,
  r.time_zone,
  r.first_due_on,
  r.next_due_on,
  r.last_due_on,
  r.status,
  r.paused_reason,
  r.created_at,
  r.updated_at,
  p.user_id,
  p.share_amount,
  p.percentage
FROM public.recurring_expense_rules r
JOIN public.recurring_expense_rule_participants p ON p.rule_id = r.id
WHERE private.can_act_as_user(p.user_id::text);

REVOKE ALL ON public.recurring_expense_rules,
  public.recurring_expense_rule_participants,
  public.recurring_expense_rule_shares FROM PUBLIC, anon;
REVOKE ALL ON public.recurring_expense_rules,
  public.recurring_expense_rule_participants,
  public.recurring_expense_rule_shares FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.recurring_expense_rules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recurring_expense_rule_participants TO authenticated;
GRANT SELECT ON public.recurring_expense_rule_shares TO authenticated;
GRANT ALL ON public.recurring_expense_rules,
  public.recurring_expense_rule_participants TO service_role;
GRANT SELECT ON public.recurring_expense_rule_shares TO service_role;

REVOKE ALL ON FUNCTION private.validate_recurring_rule_time_zone() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.validate_recurring_rule_split(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.check_recurring_rule_split_constraint() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.prevent_recurring_rule_identity_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.guard_expense_recurring_provenance() FROM PUBLIC, anon, authenticated;
