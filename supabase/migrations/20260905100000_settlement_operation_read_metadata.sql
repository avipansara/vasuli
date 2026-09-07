-- Authorized operation metadata reads for activity projections. Financial
-- tables remain revoked from clients; these RPCs expose only the facts each
-- surface is allowed to render.

CREATE OR REPLACE FUNCTION public.get_friend_settlement_operations(p_friend_id UUID)
RETURNS TABLE (
  operation_id UUID,
  status TEXT,
  created_at TIMESTAMPTZ,
  reversed_at TIMESTAMPTZ,
  requested_payment_amount NUMERIC,
  currency TEXT,
  actor_user_id UUID,
  friend_user_id UUID,
  original_date TIMESTAMPTZ,
  original_from_user_id UUID,
  original_to_user_id UUID
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE app_user_id UUID;
BEGIN
  SELECT u.id INTO app_user_id FROM public.users u
  WHERE u.auth_user_id = (SELECT auth.uid()) LIMIT 1;
  IF app_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.friendships f WHERE f.status = 'accepted'
      AND ((f.user_id = app_user_id AND f.friend_id = p_friend_id)
        OR (f.user_id = p_friend_id AND f.friend_id = app_user_id))
  ) THEN RETURN; END IF;

  RETURN QUERY
  SELECT o.id, o.status, o.created_at, o.reversed_at,
    o.requested_payment_amount, o.currency, o.actor_user_id, o.friend_user_id,
    COALESCE(first_payment.date, o.created_at), first_payment.from_user_id,
    first_payment.to_user_id
  FROM public.settlement_operations o
  LEFT JOIN LATERAL (
    SELECT s.date, s.from_user_id, s.to_user_id
    FROM public.settlements s
    WHERE s.operation_id = o.id
      AND s.created_at < COALESCE(o.reversed_at, 'infinity'::timestamptz)
    ORDER BY s.created_at, s.id LIMIT 1
  ) first_payment ON true
  WHERE (o.actor_user_id = app_user_id AND o.friend_user_id = p_friend_id)
     OR (o.actor_user_id = p_friend_id AND o.friend_user_id = app_user_id)
  ORDER BY COALESCE(first_payment.date, o.created_at) DESC, o.id DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_group_settlement_operations(p_group_id UUID)
RETURNS TABLE (
  operation_id UUID,
  status TEXT,
  created_at TIMESTAMPTZ,
  reversed_at TIMESTAMPTZ,
  currency TEXT,
  group_id UUID,
  local_payment_amount NUMERIC,
  local_date TIMESTAMPTZ,
  local_from_user_id UUID,
  local_to_user_id UUID
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE app_user_id UUID;
BEGIN
  SELECT u.id INTO app_user_id FROM public.users u
  WHERE u.auth_user_id = (SELECT auth.uid()) LIMIT 1;
  IF app_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.group_members m
    WHERE m.group_id = p_group_id AND m.user_id = app_user_id
  ) THEN RETURN; END IF;

  RETURN QUERY
  SELECT o.id, o.status, o.created_at, o.reversed_at, o.currency,
    p_group_id,
    COALESCE((SELECT SUM(s.amount) FROM public.settlements s
      WHERE s.operation_id = o.id AND s.group_id = p_group_id
        AND s.created_at < COALESCE(o.reversed_at, 'infinity'::timestamptz)), 0),
    COALESCE((SELECT MIN(s.date) FROM public.settlements s
      WHERE s.operation_id = o.id AND s.group_id = p_group_id
        AND s.created_at < COALESCE(o.reversed_at, 'infinity'::timestamptz)), o.created_at),
    COALESCE((SELECT s.from_user_id FROM public.settlements s
      WHERE s.operation_id = o.id AND s.group_id = p_group_id
        AND s.created_at < COALESCE(o.reversed_at, 'infinity'::timestamptz)
      ORDER BY s.created_at, s.id LIMIT 1), (SELECT t.from_user_id
        FROM public.settlement_scope_transfers t WHERE t.operation_id = o.id
          AND t.group_id = p_group_id ORDER BY t.created_at, t.id LIMIT 1)),
    COALESCE((SELECT s.to_user_id FROM public.settlements s
      WHERE s.operation_id = o.id AND s.group_id = p_group_id
        AND s.created_at < COALESCE(o.reversed_at, 'infinity'::timestamptz)
      ORDER BY s.created_at, s.id LIMIT 1), (SELECT t.to_user_id
        FROM public.settlement_scope_transfers t WHERE t.operation_id = o.id
          AND t.group_id = p_group_id ORDER BY t.created_at, t.id LIMIT 1))
  FROM public.settlement_operations o
  WHERE o.group_id = p_group_id
     OR EXISTS (SELECT 1 FROM public.settlement_scope_transfers t
       WHERE t.operation_id = o.id AND t.group_id = p_group_id)
     OR EXISTS (SELECT 1 FROM public.settlements local_settlement
       WHERE local_settlement.operation_id = o.id
         AND local_settlement.group_id = p_group_id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_friend_settlement_operations(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_friend_settlement_operations(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.get_group_settlement_operations(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_group_settlement_operations(UUID) TO authenticated;
