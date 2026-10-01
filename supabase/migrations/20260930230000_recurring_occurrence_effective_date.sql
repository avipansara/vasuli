-- Preserve recurring occurrence calendar dates separately from their audit instant.
ALTER TABLE public.expenses ADD COLUMN effective_date date;

-- Scheduler-created timestamps are exactly 9:00 AM in the saved rule zone.
-- Non-matching instants are treated as historical date edits and reconstructed
-- in that saved zone because the historical editor did not persist its viewer zone.
CREATE OR REPLACE FUNCTION private.resolve_recurring_effective_date(
  target_instant timestamptz,
  scheduled_on date,
  saved_zone text
)
RETURNS date
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE
    WHEN target_instant = ((scheduled_on::timestamp + time '09:00') AT TIME ZONE saved_zone)
      THEN scheduled_on
    ELSE (target_instant AT TIME ZONE saved_zone)::date
  END
$$;

UPDATE public.expenses e
SET effective_date = private.resolve_recurring_effective_date(e.date, e.scheduled_for, r.time_zone)
FROM public.recurring_expense_rules r
WHERE e.recurring_rule_id = r.id
  AND e.scheduled_for IS NOT NULL;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_effective_date_recurring_check
  CHECK ((recurring_rule_id IS NULL AND effective_date IS NULL)
      OR (recurring_rule_id IS NOT NULL AND effective_date IS NOT NULL));

CREATE OR REPLACE FUNCTION private.sync_expense_effective_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
SET row_security = off
AS $$
DECLARE rule_zone text;
BEGIN
  IF NEW.recurring_rule_id IS NULL THEN
    NEW.effective_date := NULL;
    RETURN NEW;
  END IF;

  SELECT time_zone INTO rule_zone
  FROM public.recurring_expense_rules
  WHERE id = NEW.recurring_rule_id;

  IF TG_OP = 'INSERT' THEN
    NEW.effective_date := COALESCE(NEW.effective_date, NEW.scheduled_for);
  ELSIF NEW.date IS DISTINCT FROM OLD.date
    AND NEW.effective_date IS NOT DISTINCT FROM OLD.effective_date THEN
    NEW.effective_date := private.resolve_recurring_effective_date(NEW.date, NEW.scheduled_for, rule_zone);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER expenses_sync_effective_date
BEFORE INSERT OR UPDATE OF date, effective_date ON public.expenses
FOR EACH ROW EXECUTE FUNCTION private.sync_expense_effective_date();

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
    created_by, recurring_rule_id, scheduled_for, effective_date
  ) VALUES (
    target_rule.group_id, target_rule.description, target_rule.amount,
    target_rule.currency, target_rule.paid_by, NULL,
    ((target_date::timestamp + time '09:00') AT TIME ZONE target_rule.time_zone),
    target_rule.owner_id, target_rule.id, target_date, target_date
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

-- Patch the currently installed friend projection instead of replacing it: later
-- migrations add fields such as backfilledTransferId that must remain intact.
DO $$
DECLARE
  definition text;
  old_projection text := $needle$'date', e.date,$needle$;
  new_projection text := $replacement$'date', e.date, 'effectiveDate', e.effective_date, 'recurringRuleId', e.recurring_rule_id, 'scheduledFor', e.scheduled_for,$replacement$;
  projection_count integer;
BEGIN
  SELECT pg_get_functiondef('public.get_friend_detail_read_model(uuid)'::regprocedure)
    INTO definition;
  projection_count := (length(definition) - length(replace(definition, old_projection, ''))) / length(old_projection);
  IF projection_count <> 2 THEN
    RAISE EXCEPTION 'Expected two expense date projections in friend detail RPC, found %', projection_count;
  END IF;
  definition := replace(definition, old_projection, new_projection);
  IF position('backfilledTransferId' IN definition) = 0 THEN
    RAISE EXCEPTION 'Friend detail RPC is missing the backfilled transfer marker';
  END IF;
  EXECUTE definition;
END;
$$;

REVOKE ALL ON FUNCTION private.sync_expense_effective_date() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.resolve_recurring_effective_date(timestamptz, date, text) FROM PUBLIC, anon, authenticated;
