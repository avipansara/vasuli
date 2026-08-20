-- Expose reversal metadata through the authorization-aware transfer RPCs.

DROP FUNCTION IF EXISTS public.get_friend_scope_transfers(UUID);
DROP FUNCTION IF EXISTS public.get_group_scope_transfers(UUID);

CREATE FUNCTION public.get_friend_scope_transfers(p_friend_id UUID)
RETURNS TABLE (
  id UUID,
  operation_id UUID,
  group_id UUID,
  from_user_id UUID,
  to_user_id UUID,
  currency TEXT,
  signed_group_balance_delta NUMERIC,
  note TEXT,
  is_reversal BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  app_user_id UUID;
BEGIN
  SELECT u.id INTO app_user_id
  FROM public.users u
  WHERE u.auth_user_id = (SELECT auth.uid())
  LIMIT 1;

  IF app_user_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.friendships f
    WHERE f.status = 'accepted'
      AND (
        (f.user_id = app_user_id AND f.friend_id = p_friend_id)
        OR (f.user_id = p_friend_id AND f.friend_id = app_user_id)
      )
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT t.id, t.operation_id, t.group_id, t.from_user_id, t.to_user_id,
    t.currency, t.signed_group_balance_delta, t.note, t.is_reversal, t.created_at
  FROM public.settlement_scope_transfers t
  JOIN public.settlement_operations o ON o.id = t.operation_id
  WHERE (o.actor_user_id = app_user_id AND o.friend_user_id = p_friend_id)
     OR (o.actor_user_id = p_friend_id AND o.friend_user_id = app_user_id)
  ORDER BY t.created_at DESC, t.id DESC;
END;
$$;

CREATE FUNCTION public.get_group_scope_transfers(p_group_id UUID)
RETURNS TABLE (
  id UUID,
  operation_id UUID,
  group_id UUID,
  from_user_id UUID,
  to_user_id UUID,
  currency TEXT,
  signed_group_balance_delta NUMERIC,
  note TEXT,
  is_reversal BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  app_user_id UUID;
BEGIN
  SELECT u.id INTO app_user_id
  FROM public.users u
  WHERE u.auth_user_id = (SELECT auth.uid())
  LIMIT 1;

  IF app_user_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.group_members member
    WHERE member.group_id = p_group_id
      AND member.user_id = app_user_id
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT t.id, t.operation_id, t.group_id, t.from_user_id, t.to_user_id,
    t.currency, t.signed_group_balance_delta, t.note, t.is_reversal, t.created_at
  FROM public.settlement_scope_transfers t
  WHERE t.group_id = p_group_id
  ORDER BY t.created_at DESC, t.id DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_friend_scope_transfers(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_friend_scope_transfers(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.get_group_scope_transfers(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_group_scope_transfers(UUID) TO authenticated;
