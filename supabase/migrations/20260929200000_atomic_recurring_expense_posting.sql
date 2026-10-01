-- Trusted, serialized recurring occurrence posting. The expected date is part
-- of the call contract so a retry cannot progress to a later due date.

CREATE TABLE public.recurring_expense_occurrence_outbox (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  expense_id uuid NOT NULL REFERENCES public.expenses(id) ON DELETE RESTRICT,
  rule_id uuid NOT NULL REFERENCES public.recurring_expense_rules(id) ON DELETE RESTRICT,
  scheduled_for date NOT NULL,
  recipient_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  event_type text NOT NULL DEFAULT 'occurrence_posted'
    CHECK (event_type = 'occurrence_posted'),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error text,
  CONSTRAINT recurring_occurrence_delivery_once UNIQUE (expense_id, recipient_id),
  CONSTRAINT recurring_occurrence_rule_date_recipient_once
    UNIQUE (rule_id, scheduled_for, recipient_id)
);

CREATE INDEX recurring_occurrence_outbox_pending_idx
  ON public.recurring_expense_occurrence_outbox(created_at, id)
  WHERE delivered_at IS NULL;

ALTER TABLE public.recurring_expense_occurrence_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_expense_occurrence_outbox FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.recurring_expense_occurrence_outbox FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.recurring_expense_occurrence_outbox TO service_role;

CREATE OR REPLACE FUNCTION private.recurring_occurrence_scope_error(
  target_rule public.recurring_expense_rules
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, private, pg_temp
SET row_security = off
AS $$
BEGIN
  IF target_rule.owner_id IS NULL
    OR target_rule.paid_by IS DISTINCT FROM target_rule.owner_id
    OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = target_rule.owner_id) THEN
    RETURN 'The rule owner or payer account is no longer available.';
  END IF;

  IF target_rule.scope_type = 'group' THEN
    PERFORM 1 FROM public.groups g
    WHERE g.id = target_rule.group_id AND g.deleted_at IS NULL
    FOR SHARE;
    IF NOT FOUND THEN
      RETURN 'The group was deleted. Restore it or create a new recurring expense.';
    END IF;
    PERFORM 1 FROM public.group_members gm
    WHERE gm.group_id = target_rule.group_id AND gm.user_id = target_rule.owner_id
    FOR SHARE;
    IF NOT FOUND THEN
      RETURN 'The rule owner left the group. Rejoin the group or create a new recurring expense.';
    END IF;
    PERFORM gm.id FROM public.group_members gm
    JOIN public.recurring_expense_rule_participants p
      ON p.rule_id = target_rule.id AND p.user_id = gm.user_id
    WHERE gm.group_id = target_rule.group_id
    ORDER BY gm.user_id
    FOR SHARE OF gm;
    IF (SELECT count(*) FROM public.recurring_expense_rule_participants p
        WHERE p.rule_id = target_rule.id)
      <> (SELECT count(*) FROM public.group_members gm
          JOIN public.recurring_expense_rule_participants p
            ON p.rule_id = target_rule.id AND p.user_id = gm.user_id
          WHERE gm.group_id = target_rule.group_id) THEN
      RETURN 'A saved participant left the group. Update the participants before resuming.';
    END IF;
  ELSE
    IF (SELECT count(*) FROM public.recurring_expense_rule_participants p
        WHERE p.rule_id = target_rule.id) < 2 THEN
      RETURN 'A saved participant is no longer available. Update the participants before resuming.';
    END IF;
    PERFORM f.id FROM public.friendships f
    JOIN public.recurring_expense_rule_participants p
      ON p.rule_id = target_rule.id AND p.user_id <> target_rule.owner_id
     AND ((f.user_id = target_rule.owner_id AND f.friend_id = p.user_id)
       OR (f.friend_id = target_rule.owner_id AND f.user_id = p.user_id))
    WHERE f.status = 'accepted'
    ORDER BY f.id
    FOR SHARE OF f;
    IF (SELECT count(*) FROM public.recurring_expense_rule_participants p
        WHERE p.rule_id = target_rule.id AND p.user_id <> target_rule.owner_id)
      <> (SELECT count(DISTINCT p.user_id) FROM public.friendships f
          JOIN public.recurring_expense_rule_participants p
            ON p.rule_id = target_rule.id AND p.user_id <> target_rule.owner_id
           AND ((f.user_id = target_rule.owner_id AND f.friend_id = p.user_id)
             OR (f.friend_id = target_rule.owner_id AND f.user_id = p.user_id))
          WHERE f.status = 'accepted') THEN
      RETURN 'A saved friendship is no longer accepted. Repair the friendship or edit this rule.';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION private.insert_recurring_occurrence(
  target_rule public.recurring_expense_rules,
  target_date date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
SET row_security = off
AS $$
DECLARE new_expense_id uuid;
BEGIN
  INSERT INTO public.expenses (
    group_id, description, amount, currency, paid_by, category, date,
    created_by, recurring_rule_id, scheduled_for
  ) VALUES (
    target_rule.group_id, target_rule.description, target_rule.amount,
    target_rule.currency, target_rule.paid_by, NULL,
    ((target_date::timestamp + time '09:00') AT TIME ZONE target_rule.time_zone),
    target_rule.owner_id, target_rule.id, target_date
  ) RETURNING id INTO new_expense_id;

  INSERT INTO public.expense_splits (expense_id, user_id, amount, split_type, percentage)
  SELECT new_expense_id, p.user_id, p.share_amount, target_rule.split_type, p.percentage
  FROM public.recurring_expense_rule_participants p
  WHERE p.rule_id = target_rule.id
  ORDER BY p.user_id;

  INSERT INTO public.recurring_expense_occurrence_outbox (
    expense_id, rule_id, scheduled_for, recipient_id, payload
  )
  SELECT new_expense_id, target_rule.id, target_date, p.user_id,
    jsonb_build_object(
      'expense_id', new_expense_id,
      'rule_id', target_rule.id,
      'scheduled_for', target_date,
      'amount', target_rule.amount,
      'currency', target_rule.currency,
      'share_amount', p.share_amount
    )
  FROM public.recurring_expense_rule_participants p
  WHERE p.rule_id = target_rule.id
  ORDER BY p.user_id;
  RETURN new_expense_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_due_recurring_expenses(
  p_rule_id uuid,
  p_expected_due_on date
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, private, pg_temp
SET row_security = off
AS $$
DECLARE
  rule_row public.recurring_expense_rules%ROWTYPE;
  current_instant timestamptz := clock_timestamp();
  local_today date;
  occurrence_id uuid;
  next_date date;
  invalid_reason text;
  posted jsonb := '[]'::jsonb;
  posted_count integer := 0;
  batch_start date;
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
    AND (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Trusted recurring expense worker required' USING ERRCODE = '42501';
  END IF;
  IF p_rule_id IS NULL OR p_expected_due_on IS NULL THEN
    RAISE EXCEPTION 'Rule ID and expected due date are required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO rule_row FROM public.recurring_expense_rules
  WHERE id = p_rule_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recurring rule not found' USING ERRCODE = 'P0002'; END IF;

  IF rule_row.status <> 'active' OR rule_row.next_due_on IS NULL THEN
    RETURN jsonb_build_object('rule_id', rule_row.id, 'status', rule_row.status,
      'next_due_on', rule_row.next_due_on, 'posted', posted, 'already_processed', true);
  END IF;
  IF rule_row.next_due_on IS DISTINCT FROM p_expected_due_on THEN
    IF EXISTS (SELECT 1 FROM public.expenses e
      WHERE e.recurring_rule_id = rule_row.id AND e.scheduled_for = p_expected_due_on) THEN
      RETURN jsonb_build_object('rule_id', rule_row.id, 'status', rule_row.status,
        'next_due_on', rule_row.next_due_on, 'posted', posted, 'already_processed', true);
    END IF;
    RETURN jsonb_build_object('rule_id', rule_row.id, 'status', rule_row.status,
      'next_due_on', rule_row.next_due_on, 'posted', posted, 'stale_expected_date', true);
  END IF;
  batch_start := rule_row.next_due_on;
  local_today := (current_instant AT TIME ZONE rule_row.time_zone)::date;
  IF rule_row.next_due_on > local_today
    OR current_instant < ((rule_row.next_due_on::timestamp + time '09:00') AT TIME ZONE rule_row.time_zone) THEN
    RETURN jsonb_build_object('rule_id', rule_row.id, 'status', rule_row.status,
      'next_due_on', rule_row.next_due_on, 'posted', posted, 'not_due', true);
  END IF;

  invalid_reason := private.recurring_occurrence_scope_error(rule_row);
  IF invalid_reason IS NOT NULL THEN
    UPDATE public.recurring_expense_rules
    SET status = 'paused', paused_reason = invalid_reason,
        last_error = invalid_reason, last_error_at = current_instant
    WHERE id = rule_row.id
    RETURNING * INTO rule_row;
    RETURN jsonb_build_object('rule_id', rule_row.id, 'status', rule_row.status,
      'reason', rule_row.paused_reason, 'next_due_on', rule_row.next_due_on, 'posted', posted);
  END IF;

  -- A due invocation handles at most two dates. If another date is still due,
  -- leave it as next_due_on and require the owner to review it explicitly.
  WHILE posted_count < 2 LOOP
    local_today := (current_instant AT TIME ZONE rule_row.time_zone)::date;
    IF rule_row.next_due_on IS NULL OR rule_row.next_due_on > local_today
      OR current_instant < ((rule_row.next_due_on::timestamp + time '09:00') AT TIME ZONE rule_row.time_zone) THEN
      EXIT;
    END IF;

    invalid_reason := private.recurring_occurrence_scope_error(rule_row);
    IF invalid_reason IS NOT NULL THEN
      UPDATE public.recurring_expense_rules
      SET status = 'paused', paused_reason = invalid_reason,
          last_error = invalid_reason, last_error_at = current_instant
      WHERE id = rule_row.id
      RETURNING * INTO rule_row;
      EXIT;
    END IF;

    -- Normally the rule pointer and unique index make this branch unnecessary.
    -- It repairs a lagging pointer after an interrupted legacy/manual write,
    -- and the expected-date check makes command retries idempotent.
    SELECT e.id INTO occurrence_id FROM public.expenses e
    WHERE e.recurring_rule_id = rule_row.id AND e.scheduled_for = rule_row.next_due_on;
    IF occurrence_id IS NULL THEN
      occurrence_id := private.insert_recurring_occurrence(rule_row, rule_row.next_due_on);
    END IF;
    posted := posted || jsonb_build_array(jsonb_build_object(
      'scheduled_for', rule_row.next_due_on, 'expense_id', occurrence_id));
    posted_count := posted_count + 1;

    next_date := private.next_recurring_rule_date(
      rule_row.next_due_on, rule_row.cadence, rule_row.anchor_day);
    IF rule_row.last_due_on IS NOT NULL AND next_date > rule_row.last_due_on THEN
      UPDATE public.recurring_expense_rules
      SET status = 'ended', next_due_on = NULL, paused_reason = NULL,
          last_error = NULL, last_error_at = NULL
      WHERE id = rule_row.id RETURNING * INTO rule_row;
      EXIT;
    END IF;
    UPDATE public.recurring_expense_rules
    SET next_due_on = next_date, paused_reason = NULL,
        last_error = NULL, last_error_at = NULL
    WHERE id = rule_row.id RETURNING * INTO rule_row;
  END LOOP;

  IF rule_row.status = 'active' AND rule_row.next_due_on IS NOT NULL
    AND rule_row.next_due_on <= local_today
    AND current_instant >= ((rule_row.next_due_on::timestamp + time '09:00') AT TIME ZONE rule_row.time_zone) THEN
    UPDATE public.recurring_expense_rules
    SET status = 'paused', paused_reason = 'Missed dates require owner review.'
    WHERE id = rule_row.id RETURNING * INTO rule_row;
  END IF;

  RETURN jsonb_build_object('rule_id', rule_row.id, 'status', rule_row.status,
    'next_due_on', rule_row.next_due_on, 'batch_start', batch_start,
    'posted', posted, 'reason', rule_row.paused_reason);
END;
$$;

CREATE OR REPLACE FUNCTION public.review_recurring_expense_date(
  p_rule_id uuid,
  p_expected_due_on date,
  p_action text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, private, pg_temp
SET row_security = off
AS $$
DECLARE
  actor_id uuid := private.current_recurring_app_user_id();
  rule_row public.recurring_expense_rules%ROWTYPE;
  next_date date;
  local_today date;
  current_instant timestamptz := clock_timestamp();
  invalid_reason text;
  occurrence_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR actor_id IS NULL
    OR NOT private.can_act_as_user(actor_id::text) THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('post', 'skip') THEN
    RAISE EXCEPTION 'Review action must be post or skip' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO rule_row FROM public.recurring_expense_rules
  WHERE id = p_rule_id FOR UPDATE;
  IF NOT FOUND OR rule_row.owner_id IS DISTINCT FROM actor_id THEN
    RAISE EXCEPTION 'Recurring rule not found or owner access required' USING ERRCODE = '42501';
  END IF;
  IF rule_row.status <> 'paused'
    OR rule_row.paused_reason NOT LIKE 'Missed dates require owner review%' THEN
    RAISE EXCEPTION 'This rule has no missed date awaiting review' USING ERRCODE = '22023';
  END IF;
  IF rule_row.next_due_on IS DISTINCT FROM p_expected_due_on THEN
    IF EXISTS (SELECT 1 FROM public.expenses e
      WHERE e.recurring_rule_id = rule_row.id AND e.scheduled_for = p_expected_due_on) THEN
      RETURN jsonb_build_object('rule_id', rule_row.id, 'already_reviewed', true,
        'status', rule_row.status, 'next_due_on', rule_row.next_due_on);
    END IF;
    RETURN jsonb_build_object('rule_id', rule_row.id, 'stale_expected_date', true,
      'status', rule_row.status, 'next_due_on', rule_row.next_due_on);
  END IF;
  local_today := (current_instant AT TIME ZONE rule_row.time_zone)::date;
  IF p_expected_due_on > local_today
    OR current_instant < ((p_expected_due_on::timestamp + time '09:00') AT TIME ZONE rule_row.time_zone) THEN
    RAISE EXCEPTION 'Only a missed date can be reviewed' USING ERRCODE = '22023';
  END IF;

  IF p_action = 'post' THEN
    invalid_reason := private.recurring_occurrence_scope_error(rule_row);
    IF invalid_reason IS NOT NULL THEN
      UPDATE public.recurring_expense_rules
      SET paused_reason = 'Missed dates require owner review. ' || invalid_reason,
          last_error = invalid_reason, last_error_at = now()
      WHERE id = rule_row.id;
      RETURN jsonb_build_object('rule_id', rule_row.id, 'status', 'paused',
        'reason', invalid_reason, 'reviewed', NULL);
    END IF;
    SELECT e.id INTO occurrence_id FROM public.expenses e
    WHERE e.recurring_rule_id = rule_row.id AND e.scheduled_for = p_expected_due_on;
    IF occurrence_id IS NULL THEN
      occurrence_id := private.insert_recurring_occurrence(rule_row, p_expected_due_on);
    END IF;
  END IF;

  next_date := private.next_recurring_rule_date(
    rule_row.next_due_on, rule_row.cadence, rule_row.anchor_day);
  IF rule_row.last_due_on IS NOT NULL AND next_date > rule_row.last_due_on THEN
    UPDATE public.recurring_expense_rules
    SET status = 'ended', next_due_on = NULL, paused_reason = NULL,
        last_error = NULL, last_error_at = NULL
    WHERE id = rule_row.id RETURNING * INTO rule_row;
  ELSIF next_date <= local_today THEN
    UPDATE public.recurring_expense_rules
    SET next_due_on = next_date, status = 'paused',
        paused_reason = 'Missed dates require owner review.',
        last_error = NULL, last_error_at = NULL
    WHERE id = rule_row.id RETURNING * INTO rule_row;
  ELSE
    UPDATE public.recurring_expense_rules
    SET next_due_on = next_date, status = 'active', paused_reason = NULL,
        last_error = NULL, last_error_at = NULL
    WHERE id = rule_row.id RETURNING * INTO rule_row;
  END IF;

  RETURN jsonb_build_object('rule_id', rule_row.id, 'reviewed', p_expected_due_on,
    'action', p_action, 'expense_id', occurrence_id,
    'status', rule_row.status, 'next_due_on', rule_row.next_due_on);
END;
$$;

-- Preserve the ordinary pause/resume behavior while preventing either command
-- from erasing a missed-date review barrier. Only the per-date review command
-- may consume those dates.
CREATE OR REPLACE FUNCTION public.pause_recurring_expense_rule(p_rule_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, private, pg_temp SET row_security = off
AS $$
DECLARE
  actor_id uuid := private.current_recurring_app_user_id();
  rule_row public.recurring_expense_rules%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR actor_id IS NULL
    OR NOT private.can_act_as_user(actor_id::text) THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO rule_row FROM public.recurring_expense_rules
  WHERE id = p_rule_id FOR UPDATE;
  IF NOT FOUND OR rule_row.owner_id IS DISTINCT FROM actor_id THEN
    RAISE EXCEPTION 'Recurring rule not found or owner access required' USING ERRCODE = '42501';
  END IF;
  IF rule_row.status IN ('stopped', 'ended') THEN
    RAISE EXCEPTION 'Stopped or ended recurring rules cannot be paused' USING ERRCODE = '22023';
  END IF;
  IF rule_row.status = 'paused'
    AND rule_row.paused_reason LIKE 'Missed dates require owner review%' THEN
    RAISE EXCEPTION 'Review each missed date before pausing this rule' USING ERRCODE = '22023';
  END IF;
  UPDATE public.recurring_expense_rules
  SET status = 'paused', paused_reason = 'Paused by owner'
  WHERE id = p_rule_id RETURNING * INTO rule_row;
  RETURN jsonb_build_object('rule_id', rule_row.id, 'status', rule_row.status,
    'next_due_on', rule_row.next_due_on);
END;
$$;

CREATE OR REPLACE FUNCTION public.resume_recurring_expense_rule(p_rule_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, private, pg_temp SET row_security = off
AS $$
DECLARE
  actor_id uuid := private.current_recurring_app_user_id();
  rule_row public.recurring_expense_rules%ROWTYPE;
  local_today date;
  candidate date;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR actor_id IS NULL
    OR NOT private.can_act_as_user(actor_id::text) THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO rule_row FROM public.recurring_expense_rules
  WHERE id = p_rule_id FOR UPDATE;
  IF NOT FOUND OR rule_row.owner_id IS DISTINCT FROM actor_id THEN
    RAISE EXCEPTION 'Recurring rule not found or owner access required' USING ERRCODE = '42501';
  END IF;
  IF rule_row.status <> 'paused' THEN
    RAISE EXCEPTION 'Only paused recurring rules can resume' USING ERRCODE = '22023';
  END IF;
  IF rule_row.paused_reason LIKE 'Missed dates require owner review%' THEN
    RAISE EXCEPTION 'Review each missed date before resuming this rule' USING ERRCODE = '22023';
  END IF;
  local_today := (now() AT TIME ZONE rule_row.time_zone)::date;
  candidate := rule_row.next_due_on;
  WHILE candidate <= local_today LOOP
    candidate := private.next_recurring_rule_date(candidate, rule_row.cadence, rule_row.anchor_day);
  END LOOP;
  IF rule_row.last_due_on IS NOT NULL AND candidate > rule_row.last_due_on THEN
    UPDATE public.recurring_expense_rules
    SET status = 'ended', next_due_on = NULL, paused_reason = NULL
    WHERE id = p_rule_id RETURNING * INTO rule_row;
  ELSE
    UPDATE public.recurring_expense_rules
    SET status = 'active', next_due_on = candidate, paused_reason = NULL
    WHERE id = p_rule_id RETURNING * INTO rule_row;
  END IF;
  RETURN jsonb_build_object('rule_id', rule_row.id, 'status', rule_row.status,
    'next_due_on', rule_row.next_due_on);
END;
$$;

REVOKE ALL ON FUNCTION public.post_due_recurring_expenses(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_due_recurring_expenses(uuid, date) TO service_role;
REVOKE ALL ON FUNCTION public.review_recurring_expense_date(uuid, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_recurring_expense_date(uuid, date, text) TO authenticated;

REVOKE ALL ON FUNCTION private.recurring_occurrence_scope_error(public.recurring_expense_rules) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.insert_recurring_occurrence(public.recurring_expense_rules, date) FROM PUBLIC, anon, authenticated;

-- Owner review-post commands run under the database-owned SECURITY DEFINER
-- boundary after checking the auth bridge and locking the rule. Direct client
-- INSERTs still fail because their current_user remains authenticated.
CREATE OR REPLACE FUNCTION private.guard_expense_recurring_provenance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE claim_role text := current_setting('request.jwt.claim.role', true);
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.recurring_rule_id IS NOT NULL
      AND claim_role IS DISTINCT FROM 'service_role'
      AND current_user NOT IN ('service_role', 'postgres') THEN
      RAISE EXCEPTION 'Only the trusted recurring expense command may create occurrences'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.recurring_rule_id IS DISTINCT FROM OLD.recurring_rule_id
    OR NEW.scheduled_for IS DISTINCT FROM OLD.scheduled_for THEN
    RAISE EXCEPTION 'Recurring expense provenance cannot be changed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
