-- Allow a settlement participant to create the matching settlement activity,
-- even when the displayed actor is the other participant who paid.

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
    type IN ('settlement_created', 'settlement_updated')
    AND EXISTS (
      SELECT 1
      FROM public.settlements s
      WHERE s.id::text = target_id::text
        AND s.from_user_id::text = user_id::text
        AND (
          private.can_act_as_user(s.from_user_id::text)
          OR private.can_act_as_user(s.to_user_id::text)
        )
        AND (
          (group_id IS NULL AND s.group_id IS NULL)
          OR group_id::text = s.group_id::text
        )
    )
  )
);
