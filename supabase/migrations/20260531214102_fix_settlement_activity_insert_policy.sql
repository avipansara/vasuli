-- Keep settlement activity authorization aligned with settlement RLS.
-- A user may log the activity for a settlement when they can act as either
-- participant, even if the displayed activity actor is the paying participant.

CREATE OR REPLACE FUNCTION private.can_log_settlement_activity(
  activity_user_id text,
  activity_target_id text,
  activity_group_id text DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.settlements s
    WHERE s.id::text = activity_target_id
      AND s.from_user_id::text = activity_user_id
      AND (
        private.can_act_as_user(s.from_user_id::text)
        OR private.can_act_as_user(s.to_user_id::text)
      )
      AND (
        (activity_group_id IS NULL AND s.group_id IS NULL)
        OR activity_group_id = s.group_id::text
      )
  )
$$;

REVOKE ALL ON FUNCTION private.can_log_settlement_activity(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_log_settlement_activity(text, text, text) TO authenticated;

DROP POLICY IF EXISTS "activities_insert_authenticated" ON public.activities;

CREATE POLICY "activities_insert_authenticated"
ON public.activities
FOR INSERT
TO authenticated
WITH CHECK (
  private.can_act_as_user(user_id::text)
  OR (
    group_id IS NOT NULL
    AND private.is_group_member(group_id::text)
  )
  OR (
    type = 'settlement_created'
    AND private.can_log_settlement_activity(
      user_id::text,
      target_id::text,
      group_id::text
    )
  )
);
