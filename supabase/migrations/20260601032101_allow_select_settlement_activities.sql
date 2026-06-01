-- PostgREST insert().select() must pass SELECT RLS on the inserted row.
-- Settlement activities can use the settlement payer as activity.user_id, so
-- allow either settlement participant to read back that activity row.

DROP POLICY IF EXISTS "activities_select_authenticated" ON public.activities;

CREATE POLICY "activities_select_authenticated"
ON public.activities
FOR SELECT
TO authenticated
USING (
  private.can_act_as_user(user_id::text)
  OR (
    group_id IS NOT NULL
    AND private.is_group_member(group_id::text)
  )
  OR (
    target_id IS NOT NULL
    AND private.can_view_expense(target_id::text)
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
