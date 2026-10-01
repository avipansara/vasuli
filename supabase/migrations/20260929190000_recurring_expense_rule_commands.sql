-- Server-owned recurring expense rule commands.
-- Every mutating RPC locks the rule row. The scheduled poster must take this
-- same lock before it creates an occurrence so a committed post or edit wins
-- as one transaction.

ALTER TABLE public.recurring_expense_rules
  ADD COLUMN command_revision integer NOT NULL DEFAULT 1
  CHECK (command_revision > 0);

CREATE TABLE public.recurring_expense_rule_notification_outbox (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  rule_id uuid NOT NULL REFERENCES public.recurring_expense_rules(id) ON DELETE CASCADE,
  rule_revision integer NOT NULL CHECK (rule_revision > 0),
  recipient_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('rule_created', 'rule_updated')),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error text,
  CONSTRAINT recurring_rule_notification_once UNIQUE (rule_id, rule_revision, recipient_id)
);

CREATE INDEX recurring_rule_notification_pending_idx
  ON public.recurring_expense_rule_notification_outbox(created_at, id)
  WHERE delivered_at IS NULL;

ALTER TABLE public.recurring_expense_rule_notification_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_expense_rule_notification_outbox FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.recurring_expense_rule_notification_outbox FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.recurring_expense_rule_notification_outbox TO service_role;

-- The schema migration temporarily grants owner writes for staged rollout.
-- Triggers close that direct-table API while allowing the SECURITY DEFINER
-- commands (whose current_user is their trusted owner) to perform validated
-- changes. This keeps an RLS-filtered participant UPDATE as a zero-row result.
CREATE OR REPLACE FUNCTION private.guard_recurring_rule_command_boundary()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF current_user = 'authenticated' THEN
    RAISE EXCEPTION 'Use the recurring expense rule command' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER recurring_expense_rules_command_boundary
  BEFORE INSERT OR UPDATE OR DELETE ON public.recurring_expense_rules
  FOR EACH ROW EXECUTE FUNCTION private.guard_recurring_rule_command_boundary();
CREATE TRIGGER recurring_expense_rule_participants_command_boundary
  BEFORE INSERT OR UPDATE OR DELETE ON public.recurring_expense_rule_participants
  FOR EACH ROW EXECUTE FUNCTION private.guard_recurring_rule_command_boundary();

CREATE OR REPLACE FUNCTION private.current_recurring_app_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
  SELECT u.id
  FROM public.users u
  WHERE u.auth_user_id = (SELECT auth.uid())
     OR lower(btrim(u.email)) = private.current_app_user_email()
  ORDER BY (u.auth_user_id = (SELECT auth.uid())) DESC NULLS LAST, u.id
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION private.next_recurring_rule_date(
  due_date date,
  rule_cadence text,
  rule_anchor_day integer
)
RETURNS date
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT CASE rule_cadence
    WHEN 'weekly' THEN due_date + 7
    WHEN 'monthly' THEN
      (date_trunc('month', due_date + interval '1 month')::date
        + (LEAST(rule_anchor_day,
             extract(day FROM (date_trunc('month', due_date + interval '1 month')
               + interval '1 month - 1 day'))::integer) - 1))
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION private.validate_recurring_rule_command(
  actor_id uuid,
  rule_data jsonb,
  participant_data jsonb,
  existing_rule public.recurring_expense_rules DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
SET row_security = off
AS $$
DECLARE
  scope_value text := COALESCE(rule_data->>'scope_type', existing_rule.scope_type);
  group_value uuid := CASE WHEN rule_data ? 'group_id' THEN NULLIF(rule_data->>'group_id', '')::uuid ELSE existing_rule.group_id END;
  description_value text := COALESCE(rule_data->>'description', existing_rule.description);
  amount_value numeric := COALESCE(NULLIF(rule_data->>'amount', '')::numeric, existing_rule.amount);
  currency_value text := COALESCE(rule_data->>'currency', existing_rule.currency);
  split_method_value text := COALESCE(rule_data->>'split_method', existing_rule.split_method);
  split_type_value text := COALESCE(rule_data->>'split_type', existing_rule.split_type);
  cadence_value text := COALESCE(rule_data->>'cadence', existing_rule.cadence);
  anchor_value integer := COALESCE(NULLIF(rule_data->>'anchor_day', '')::integer, existing_rule.anchor_day);
  zone_value text := COALESCE(rule_data->>'time_zone', existing_rule.time_zone);
  first_due_value date := COALESCE(NULLIF(rule_data->>'first_due_on', '')::date, existing_rule.first_due_on);
  last_due_value date := CASE WHEN rule_data ? 'last_due_on' THEN NULLIF(rule_data->>'last_due_on', '')::date ELSE existing_rule.last_due_on END;
  participant_count integer;
  distinct_count integer;
  share_total numeric;
  percentage_total numeric;
  percentage_count integer;
  owner_count integer;
  invalid_count integer;
  zone_today date;
BEGIN
  IF participant_data IS NULL OR jsonb_typeof(participant_data) <> 'array' THEN
    RAISE EXCEPTION 'Participants must be supplied as an array' USING ERRCODE = '22023';
  END IF;
  IF amount_value IS NULL OR amount_value <= 0 OR amount_value * 100 <> trunc(amount_value * 100) THEN
    RAISE EXCEPTION 'Amount must be positive and use exact cents' USING ERRCODE = '22023';
  END IF;
  IF scope_value IS NULL OR scope_value NOT IN ('group', 'friends')
     OR (scope_value = 'group' AND group_value IS NULL)
     OR (scope_value = 'friends' AND group_value IS NOT NULL) THEN
    RAISE EXCEPTION 'Invalid recurring expense scope' USING ERRCODE = '22023';
  END IF;
  IF description_value IS NULL OR btrim(description_value) = '' THEN
    RAISE EXCEPTION 'Description is required' USING ERRCODE = '22023';
  END IF;
  IF currency_value IS NULL OR currency_value !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Currency must be a three-letter uppercase code' USING ERRCODE = '22023';
  END IF;
  IF rule_data ? 'paid_by'
     AND NULLIF(rule_data->>'paid_by', '')::uuid IS DISTINCT FROM actor_id THEN
    RAISE EXCEPTION 'The rule owner must be the payer' USING ERRCODE = '42501';
  END IF;
  IF existing_rule.id IS NOT NULL AND currency_value IS DISTINCT FROM existing_rule.currency THEN
    RAISE EXCEPTION 'Rule currency cannot be changed' USING ERRCODE = '22023';
  END IF;
  IF cadence_value IS NULL OR anchor_value IS NULL
     OR cadence_value NOT IN ('weekly', 'monthly')
     OR (cadence_value = 'weekly' AND anchor_value NOT BETWEEN 0 AND 6)
     OR (cadence_value = 'monthly' AND anchor_value NOT BETWEEN 1 AND 31) THEN
    RAISE EXCEPTION 'Invalid recurring cadence or anchor day' USING ERRCODE = '22023';
  END IF;
  IF zone_value IS NULL OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names z WHERE z.name = zone_value) THEN
    RAISE EXCEPTION 'Unknown time zone' USING ERRCODE = '22023';
  END IF;
  IF first_due_value IS NULL OR last_due_value < first_due_value THEN
    RAISE EXCEPTION 'Invalid recurring due date range' USING ERRCODE = '22023';
  END IF;
  IF existing_rule.id IS NULL AND (
    (cadence_value = 'weekly' AND anchor_value <> extract(dow FROM first_due_value)::integer)
    OR (cadence_value = 'monthly' AND anchor_value <> extract(day FROM first_due_value)::integer)
  ) THEN
    RAISE EXCEPTION 'Cadence anchor must match the first due date' USING ERRCODE = '22023';
  END IF;
  IF split_method_value IS NULL OR split_type_value IS NULL
     OR split_method_value NOT IN ('equal', 'unequal', 'percentage', 'shares')
     OR split_type_value NOT IN ('equal', 'exact', 'percentage')
     OR NOT ((split_method_value = 'equal' AND split_type_value = 'equal')
       OR (split_method_value IN ('unequal', 'shares') AND split_type_value = 'exact')
       OR (split_method_value = 'percentage' AND split_type_value = 'percentage')) THEN
    RAISE EXCEPTION 'Invalid split method' USING ERRCODE = '22023';
  END IF;

  SELECT count(*), count(DISTINCT participant.user_id),
         COALESCE(sum(participant.share_amount), 0),
         COALESCE(sum(participant.percentage), 0), count(participant.percentage),
         count(*) FILTER (WHERE participant.user_id = actor_id),
         count(*) FILTER (WHERE u.id IS NULL OR participant.share_amount IS NULL OR participant.share_amount < 0
           OR participant.share_amount * 100 <> trunc(participant.share_amount * 100)
           OR (participant.percentage IS NOT NULL AND
               (participant.percentage < 0 OR participant.percentage > 100
                OR participant.percentage * 100 <> trunc(participant.percentage * 100))))
  INTO participant_count, distinct_count, share_total, percentage_total,
       percentage_count, owner_count, invalid_count
  FROM jsonb_to_recordset(participant_data) AS participant(user_id uuid, share_amount numeric, percentage numeric)
  LEFT JOIN public.users u ON u.id = participant.user_id;

  IF participant_count = 0 OR participant_count <> distinct_count OR invalid_count > 0 OR share_total <> amount_value THEN
    RAISE EXCEPTION 'Participants must be unique users with valid shares totaling the amount' USING ERRCODE = '23514';
  END IF;
  IF (split_type_value = 'percentage' AND (percentage_count <> participant_count OR percentage_total <> 100))
     OR (split_type_value <> 'percentage' AND percentage_count <> 0) THEN
    RAISE EXCEPTION 'Percentages must total 100 only for percentage splits' USING ERRCODE = '23514';
  END IF;
  IF scope_value = 'friends' AND (owner_count <> 1 OR participant_count < 2) THEN
    RAISE EXCEPTION 'Direct friend rules must include the owner and at least one friend' USING ERRCODE = '23514';
  END IF;
  IF scope_value = 'group' THEN
    IF NOT EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id = group_value AND gm.user_id = actor_id) THEN
      RAISE EXCEPTION 'The owner must belong to the selected group' USING ERRCODE = '42501';
    END IF;
    SELECT count(*) INTO invalid_count
    FROM jsonb_to_recordset(participant_data) AS participant(user_id uuid, share_amount numeric, percentage numeric)
    WHERE NOT EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id = group_value AND gm.user_id = participant.user_id);
    IF invalid_count > 0 THEN
      RAISE EXCEPTION 'Every participant must belong to the selected group' USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT count(*) INTO invalid_count
    FROM jsonb_to_recordset(participant_data) AS participant(user_id uuid, share_amount numeric, percentage numeric)
    WHERE participant.user_id <> actor_id
      AND NOT EXISTS (
        SELECT 1 FROM public.friendships f
        WHERE f.status = 'accepted'
          AND ((f.user_id = actor_id AND f.friend_id = participant.user_id)
            OR (f.friend_id = actor_id AND f.user_id = participant.user_id))
      );
    IF invalid_count > 0 THEN
      RAISE EXCEPTION 'Every direct participant must be an accepted friend' USING ERRCODE = '23514';
    END IF;
  END IF;

  zone_today := (now() AT TIME ZONE zone_value)::date;
  IF existing_rule.id IS NULL AND first_due_value < zone_today THEN
    RAISE EXCEPTION 'A recurring expense cannot start in the past' USING ERRCODE = '22023';
  END IF;
  IF last_due_value IS NOT NULL AND last_due_value < first_due_value THEN
    RAISE EXCEPTION 'Last due date cannot precede the first due date' USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object(
    'scope_type', scope_value, 'group_id', group_value,
    'description', btrim(description_value), 'amount', amount_value,
    'currency', currency_value, 'split_method', split_method_value,
    'split_type', split_type_value, 'cadence', cadence_value,
    'anchor_day', anchor_value, 'time_zone', zone_value,
    'first_due_on', first_due_value, 'last_due_on', last_due_value
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.enqueue_recurring_rule_notifications(
  target_rule_id uuid,
  target_revision integer,
  target_event text,
  recipients uuid[],
  event_payload jsonb
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, private, pg_temp
SET row_security = off
AS $$
  INSERT INTO public.recurring_expense_rule_notification_outbox (
    rule_id, rule_revision, recipient_id, event_type, payload
  )
  SELECT target_rule_id, target_revision, recipient_rows.recipient_id, target_event, event_payload
  FROM unnest(recipients) AS recipient_rows(recipient_id)
  ON CONFLICT (rule_id, rule_revision, recipient_id) DO NOTHING
$$;

CREATE OR REPLACE FUNCTION public.create_recurring_expense_rule(
  p_rule jsonb,
  p_participants jsonb,
  p_confirm_duplicate boolean DEFAULT false
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
  clean_rule jsonb;
  new_rule public.recurring_expense_rules%ROWTYPE;
  participant_ids uuid[];
  duplicate_rule_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR actor_id IS NULL OR NOT private.can_act_as_user(actor_id::text) THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  clean_rule := private.validate_recurring_rule_command(actor_id, p_rule, p_participants, NULL);

  SELECT r.id INTO duplicate_rule_id
  FROM public.recurring_expense_rules r
  WHERE r.owner_id = actor_id AND r.status IN ('active', 'paused')
    AND r.scope_type = clean_rule->>'scope_type'
    AND r.group_id IS NOT DISTINCT FROM NULLIF(clean_rule->>'group_id', '')::uuid
    AND lower(btrim(r.description)) = lower(btrim(clean_rule->>'description'))
    AND r.amount = (clean_rule->>'amount')::numeric
    AND r.currency = clean_rule->>'currency'
    AND r.cadence = clean_rule->>'cadence'
    AND r.first_due_on = (clean_rule->>'first_due_on')::date
    AND NOT EXISTS (
      SELECT 1 FROM public.recurring_expense_rule_participants old_participant
      WHERE old_participant.rule_id = r.id
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_to_recordset(p_participants) AS candidate(user_id uuid)
          WHERE candidate.user_id = old_participant.user_id
        )
    )
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_to_recordset(p_participants) AS candidate(user_id uuid)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.recurring_expense_rule_participants old_participant
        WHERE old_participant.rule_id = r.id AND old_participant.user_id = candidate.user_id
      )
    )
  ORDER BY r.created_at DESC
  LIMIT 1;

  IF duplicate_rule_id IS NOT NULL AND NOT p_confirm_duplicate THEN
    RETURN jsonb_build_object('duplicate_warning', true, 'existing_rule_id', duplicate_rule_id);
  END IF;

  INSERT INTO public.recurring_expense_rules (
    owner_id, scope_type, group_id, description, amount, currency, paid_by,
    split_method, split_type, cadence, anchor_day, time_zone,
    first_due_on, next_due_on, last_due_on
  ) VALUES (
    actor_id, clean_rule->>'scope_type', NULLIF(clean_rule->>'group_id', '')::uuid,
    clean_rule->>'description', (clean_rule->>'amount')::numeric, clean_rule->>'currency', actor_id,
    clean_rule->>'split_method', clean_rule->>'split_type', clean_rule->>'cadence',
    (clean_rule->>'anchor_day')::smallint, clean_rule->>'time_zone',
    (clean_rule->>'first_due_on')::date, (clean_rule->>'first_due_on')::date,
    NULLIF(clean_rule->>'last_due_on', '')::date
  ) RETURNING * INTO new_rule;

  INSERT INTO public.recurring_expense_rule_participants (rule_id, user_id, share_amount, percentage)
  SELECT new_rule.id, participant.user_id, participant.share_amount, participant.percentage
  FROM jsonb_to_recordset(p_participants) AS participant(user_id uuid, share_amount numeric, percentage numeric);
  SELECT array_agg(participant.user_id ORDER BY participant.user_id)
  INTO participant_ids
  FROM public.recurring_expense_rule_participants participant
  WHERE participant.rule_id = new_rule.id AND participant.user_id <> actor_id;
  PERFORM private.enqueue_recurring_rule_notifications(
    new_rule.id, new_rule.command_revision, 'rule_created', participant_ids,
    jsonb_build_object('description', new_rule.description, 'amount', new_rule.amount,
      'currency', new_rule.currency, 'next_due_on', new_rule.next_due_on,
      'cadence', new_rule.cadence)
  );
  RETURN jsonb_build_object('duplicate_warning', false, 'rule_id', new_rule.id,
    'next_due_on', new_rule.next_due_on, 'status', new_rule.status);
END;
$$;

CREATE OR REPLACE FUNCTION public.edit_recurring_expense_rule(
  p_rule_id uuid,
  p_rule jsonb,
  p_participants jsonb
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
  old_rule public.recurring_expense_rules%ROWTYPE;
  new_rule public.recurring_expense_rules%ROWTYPE;
  clean_rule jsonb;
  old_participants uuid[];
  new_participants uuid[];
  notify_participants uuid[];
  next_revision integer;
  material boolean;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR actor_id IS NULL OR NOT private.can_act_as_user(actor_id::text) THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO old_rule FROM public.recurring_expense_rules WHERE id = p_rule_id FOR UPDATE;
  IF NOT FOUND OR old_rule.owner_id IS DISTINCT FROM actor_id THEN
    RAISE EXCEPTION 'Recurring rule not found or owner access required' USING ERRCODE = '42501';
  END IF;
  IF old_rule.status IN ('stopped', 'ended') THEN
    RAISE EXCEPTION 'Stopped or ended recurring rules cannot be edited' USING ERRCODE = '22023';
  END IF;

  clean_rule := private.validate_recurring_rule_command(actor_id, p_rule, p_participants, old_rule);
  IF clean_rule->>'first_due_on' IS DISTINCT FROM old_rule.first_due_on::text
     OR clean_rule->>'cadence' IS DISTINCT FROM old_rule.cadence
     OR (clean_rule->>'anchor_day')::smallint IS DISTINCT FROM old_rule.anchor_day
     OR clean_rule->>'time_zone' IS DISTINCT FROM old_rule.time_zone THEN
    RAISE EXCEPTION 'First due date, cadence, anchor day, and time zone cannot be changed after creation'
      USING ERRCODE = '22023';
  END IF;
  IF old_rule.next_due_on IS NULL THEN
    RAISE EXCEPTION 'There is no future due date to edit' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(clean_rule->>'last_due_on', '')::date IS NOT NULL
     AND (clean_rule->>'last_due_on')::date < old_rule.next_due_on THEN
    RAISE EXCEPTION 'Last due date cannot precede the next unposted date' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(user_id ORDER BY user_id) INTO old_participants
  FROM public.recurring_expense_rule_participants WHERE rule_id = old_rule.id;
  SELECT array_agg(participant.user_id ORDER BY participant.user_id) INTO new_participants
  FROM jsonb_to_recordset(p_participants) AS participant(user_id uuid, share_amount numeric, percentage numeric);
  material := old_rule.description IS DISTINCT FROM clean_rule->>'description'
    OR old_rule.amount IS DISTINCT FROM (clean_rule->>'amount')::numeric
    OR old_rule.scope_type IS DISTINCT FROM clean_rule->>'scope_type'
    OR old_rule.group_id IS DISTINCT FROM NULLIF(clean_rule->>'group_id', '')::uuid
    OR old_rule.split_method IS DISTINCT FROM clean_rule->>'split_method'
    OR old_rule.split_type IS DISTINCT FROM clean_rule->>'split_type'
    OR old_rule.cadence IS DISTINCT FROM clean_rule->>'cadence'
    OR old_rule.anchor_day IS DISTINCT FROM (clean_rule->>'anchor_day')::smallint
    OR old_rule.last_due_on IS DISTINCT FROM NULLIF(clean_rule->>'last_due_on', '')::date
    OR old_participants IS DISTINCT FROM new_participants
    OR EXISTS (
      SELECT 1 FROM jsonb_to_recordset(p_participants) AS candidate(user_id uuid, share_amount numeric, percentage numeric)
      LEFT JOIN public.recurring_expense_rule_participants old_split
        ON old_split.rule_id = old_rule.id AND old_split.user_id = candidate.user_id
      WHERE old_split.user_id IS NULL
         OR old_split.share_amount IS DISTINCT FROM candidate.share_amount
         OR old_split.percentage IS DISTINCT FROM candidate.percentage
    );
  next_revision := old_rule.command_revision + CASE WHEN material THEN 1 ELSE 0 END;

  UPDATE public.recurring_expense_rules SET
    scope_type = clean_rule->>'scope_type', group_id = NULLIF(clean_rule->>'group_id', '')::uuid,
    description = clean_rule->>'description', amount = (clean_rule->>'amount')::numeric,
    split_method = clean_rule->>'split_method', split_type = clean_rule->>'split_type',
    cadence = clean_rule->>'cadence', anchor_day = (clean_rule->>'anchor_day')::smallint,
    time_zone = clean_rule->>'time_zone', last_due_on = NULLIF(clean_rule->>'last_due_on', '')::date,
    command_revision = next_revision
  WHERE id = old_rule.id
  RETURNING * INTO new_rule;

  DELETE FROM public.recurring_expense_rule_participants WHERE rule_id = old_rule.id;
  INSERT INTO public.recurring_expense_rule_participants (rule_id, user_id, share_amount, percentage)
  SELECT old_rule.id, participant.user_id, participant.share_amount, participant.percentage
  FROM jsonb_to_recordset(p_participants) AS participant(user_id uuid, share_amount numeric, percentage numeric);

  IF material THEN
    SELECT array_agg(DISTINCT recipient_rows.recipient_id ORDER BY recipient_rows.recipient_id)
    INTO notify_participants
    FROM unnest(COALESCE(old_participants, '{}'::uuid[]) || COALESCE(new_participants, '{}'::uuid[]))
      AS recipient_rows(recipient_id)
    WHERE recipient_rows.recipient_id <> actor_id;
    PERFORM private.enqueue_recurring_rule_notifications(
      new_rule.id, new_rule.command_revision, 'rule_updated', notify_participants,
      jsonb_build_object('description', new_rule.description, 'amount', new_rule.amount,
        'currency', new_rule.currency, 'next_due_on', new_rule.next_due_on,
        'cadence', new_rule.cadence)
    );
  END IF;
  RETURN jsonb_build_object('rule_id', new_rule.id, 'applies_from', new_rule.next_due_on,
    'status', new_rule.status, 'material_change', material);
END;
$$;

CREATE OR REPLACE FUNCTION public.pause_recurring_expense_rule(p_rule_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, private, pg_temp SET row_security = off
AS $$
DECLARE actor_id uuid := private.current_recurring_app_user_id(); rule_row public.recurring_expense_rules%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR actor_id IS NULL OR NOT private.can_act_as_user(actor_id::text) THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO rule_row FROM public.recurring_expense_rules WHERE id = p_rule_id FOR UPDATE;
  IF NOT FOUND OR rule_row.owner_id IS DISTINCT FROM actor_id THEN RAISE EXCEPTION 'Recurring rule not found or owner access required' USING ERRCODE = '42501'; END IF;
  IF rule_row.status IN ('stopped', 'ended') THEN RAISE EXCEPTION 'Stopped or ended recurring rules cannot be paused' USING ERRCODE = '22023'; END IF;
  UPDATE public.recurring_expense_rules SET status = 'paused', paused_reason = 'Paused by owner' WHERE id = p_rule_id RETURNING * INTO rule_row;
  RETURN jsonb_build_object('rule_id', rule_row.id, 'status', rule_row.status, 'next_due_on', rule_row.next_due_on);
END;
$$;

CREATE OR REPLACE FUNCTION public.resume_recurring_expense_rule(p_rule_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, private, pg_temp SET row_security = off
AS $$
DECLARE actor_id uuid := private.current_recurring_app_user_id(); rule_row public.recurring_expense_rules%ROWTYPE; today date; candidate date;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR actor_id IS NULL OR NOT private.can_act_as_user(actor_id::text) THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO rule_row FROM public.recurring_expense_rules WHERE id = p_rule_id FOR UPDATE;
  IF NOT FOUND OR rule_row.owner_id IS DISTINCT FROM actor_id THEN RAISE EXCEPTION 'Recurring rule not found or owner access required' USING ERRCODE = '42501'; END IF;
  IF rule_row.status <> 'paused' THEN RAISE EXCEPTION 'Only paused recurring rules can resume' USING ERRCODE = '22023'; END IF;
  today := (now() AT TIME ZONE rule_row.time_zone)::date;
  candidate := rule_row.next_due_on;
  WHILE candidate <= today LOOP
    candidate := private.next_recurring_rule_date(candidate, rule_row.cadence, rule_row.anchor_day);
  END LOOP;
  IF rule_row.last_due_on IS NOT NULL AND candidate > rule_row.last_due_on THEN
    UPDATE public.recurring_expense_rules SET status = 'ended', next_due_on = NULL, paused_reason = NULL WHERE id = p_rule_id RETURNING * INTO rule_row;
  ELSE
    UPDATE public.recurring_expense_rules SET status = 'active', next_due_on = candidate, paused_reason = NULL WHERE id = p_rule_id RETURNING * INTO rule_row;
  END IF;
  RETURN jsonb_build_object('rule_id', rule_row.id, 'status', rule_row.status, 'next_due_on', rule_row.next_due_on);
END;
$$;

CREATE OR REPLACE FUNCTION public.stop_recurring_expense_rule(p_rule_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, private, pg_temp SET row_security = off
AS $$
DECLARE actor_id uuid := private.current_recurring_app_user_id(); rule_row public.recurring_expense_rules%ROWTYPE; stopped_after date; last_posted date;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR actor_id IS NULL OR NOT private.can_act_as_user(actor_id::text) THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO rule_row FROM public.recurring_expense_rules WHERE id = p_rule_id FOR UPDATE;
  IF NOT FOUND OR rule_row.owner_id IS DISTINCT FROM actor_id THEN RAISE EXCEPTION 'Recurring rule not found or owner access required' USING ERRCODE = '42501'; END IF;
  IF rule_row.status IN ('stopped', 'ended') THEN RAISE EXCEPTION 'Recurring rule is already terminal' USING ERRCODE = '22023'; END IF;
  stopped_after := rule_row.next_due_on;
  SELECT max(e.scheduled_for) INTO last_posted FROM public.expenses e WHERE e.recurring_rule_id = p_rule_id;
  UPDATE public.recurring_expense_rules SET status = 'stopped', next_due_on = NULL, paused_reason = NULL WHERE id = p_rule_id RETURNING * INTO rule_row;
  RETURN jsonb_build_object('rule_id', rule_row.id, 'status', rule_row.status,
    'stopped_after_due_on', stopped_after, 'last_posted_due_on', last_posted);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_recurring_expense_rule(p_rule_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, private, pg_temp SET row_security = off
AS $$
DECLARE actor_id uuid := private.current_recurring_app_user_id(); rule_row public.recurring_expense_rules%ROWTYPE; owner_access boolean;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR actor_id IS NULL OR NOT private.can_act_as_user(actor_id::text) THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO rule_row FROM public.recurring_expense_rules WHERE id = p_rule_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  owner_access := rule_row.owner_id = actor_id;
  IF NOT owner_access AND NOT EXISTS (SELECT 1 FROM public.recurring_expense_rule_participants p WHERE p.rule_id = p_rule_id AND p.user_id = actor_id) THEN
    RAISE EXCEPTION 'Recurring rule not found or participant access required' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'id', rule_row.id, 'owner_id', CASE WHEN owner_access THEN rule_row.owner_id ELSE NULL END,
    'scope_type', rule_row.scope_type, 'group_id', rule_row.group_id,
    'description', rule_row.description, 'amount', rule_row.amount, 'currency', rule_row.currency,
    'paid_by', rule_row.paid_by, 'split_method', rule_row.split_method, 'split_type', rule_row.split_type,
    'cadence', rule_row.cadence, 'anchor_day', rule_row.anchor_day, 'time_zone', rule_row.time_zone,
    'first_due_on', rule_row.first_due_on, 'next_due_on', rule_row.next_due_on,
    'last_due_on', rule_row.last_due_on, 'status', rule_row.status,
    'paused_reason', rule_row.paused_reason, 'created_at', rule_row.created_at,
    'updated_at', rule_row.updated_at,
    'participants', (SELECT jsonb_agg(jsonb_build_object('user_id', p.user_id,
       'share_amount', p.share_amount, 'percentage', p.percentage) ORDER BY p.user_id)
      FROM public.recurring_expense_rule_participants p
      WHERE p.rule_id = p_rule_id AND (owner_access OR p.user_id = actor_id))
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_recurring_expense_rules()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, private, pg_temp SET row_security = off
AS $$
DECLARE actor_id uuid := private.current_recurring_app_user_id();
BEGIN
  IF (SELECT auth.uid()) IS NULL OR actor_id IS NULL OR NOT private.can_act_as_user(actor_id::text) THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(rule_json ORDER BY owner_rank DESC, status_rank, next_due_on NULLS LAST, created_at DESC)
    FROM (
      SELECT
        r.owner_id = actor_id AS owner_rank,
        CASE r.status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 WHEN 'stopped' THEN 2 ELSE 3 END AS status_rank,
        r.next_due_on, r.created_at,
        jsonb_build_object(
          'id', r.id, 'owner_id', CASE WHEN r.owner_id = actor_id THEN r.owner_id ELSE NULL END,
          'scope_type', r.scope_type, 'group_id', r.group_id,
          'description', r.description, 'amount', r.amount, 'currency', r.currency,
          'paid_by', r.paid_by, 'split_method', r.split_method, 'split_type', r.split_type,
          'cadence', r.cadence, 'anchor_day', r.anchor_day, 'time_zone', r.time_zone,
          'first_due_on', r.first_due_on, 'next_due_on', r.next_due_on,
          'last_due_on', r.last_due_on, 'status', r.status,
          'paused_reason', r.paused_reason, 'created_at', r.created_at,
          'updated_at', r.updated_at,
          'participants', (SELECT jsonb_agg(jsonb_build_object('user_id', p.user_id,
              'share_amount', p.share_amount, 'percentage', p.percentage) ORDER BY p.user_id)
            FROM public.recurring_expense_rule_participants p
            WHERE p.rule_id = r.id AND (r.owner_id = actor_id OR p.user_id = actor_id))
        ) AS rule_json
      FROM public.recurring_expense_rules r
      WHERE r.owner_id = actor_id OR EXISTS (
        SELECT 1 FROM public.recurring_expense_rule_participants p
        WHERE p.rule_id = r.id AND p.user_id = actor_id
      )
    ) visible_rules
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION private.current_recurring_app_user_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.guard_recurring_rule_command_boundary() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.next_recurring_rule_date(date, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.validate_recurring_rule_command(uuid, jsonb, jsonb, public.recurring_expense_rules) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.enqueue_recurring_rule_notifications(uuid, integer, text, uuid[], jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_recurring_expense_rule(jsonb, jsonb, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.edit_recurring_expense_rule(uuid, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pause_recurring_expense_rule(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resume_recurring_expense_rule(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stop_recurring_expense_rule(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_recurring_expense_rule(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_recurring_expense_rules() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_recurring_expense_rule(jsonb, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.edit_recurring_expense_rule(uuid, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pause_recurring_expense_rule(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resume_recurring_expense_rule(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stop_recurring_expense_rule(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_recurring_expense_rule(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_recurring_expense_rules() TO authenticated;
