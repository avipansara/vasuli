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

  -- Groups with no remaining members are fully removed. Their expenses and
  -- settlements cascade away; shared groups remain available to other users.
  DELETE FROM public.groups group_record
  WHERE group_record.id = ANY(member_group_ids)
    AND NOT EXISTS (
      SELECT 1
      FROM public.group_members remaining_member
      WHERE remaining_member.group_id = group_record.id
    );

  -- Keep shared expenses/splits/settlements for the other participants, but
  -- remove the account's personal identity and auth linkage is cleared when
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
