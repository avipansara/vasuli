-- Use a named constraint for transfer idempotency so PL/pgSQL cannot confuse
-- the conflict target columns with the operation variable.

ALTER TABLE public.settlement_scope_transfers
  ADD CONSTRAINT settlement_scope_transfers_operation_group_key
  UNIQUE (operation_id, group_id);

DROP FUNCTION IF EXISTS public.commit_settlement_operation(UUID, UUID, UUID, TEXT, NUMERIC, TEXT, TIMESTAMPTZ, NUMERIC, JSONB, JSONB);

CREATE OR REPLACE FUNCTION public.commit_settlement_operation(
  p_payment_intent_id UUID,
  p_friend_id UUID,
  p_group_id UUID,
  p_mode TEXT,
  p_amount NUMERIC,
  p_currency TEXT,
  p_date TIMESTAMPTZ,
  p_expected_balance NUMERIC,
  p_allocations JSONB,
  p_transfers JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
<<settlement_operation_block>>
DECLARE
  app_user_id UUID;
  operation_id UUID;
  transfer JSONB;
  transfer_group_id UUID;
  transfer_from_user_id UUID;
  transfer_to_user_id UUID;
  transfer_currency TEXT;
  transfer_delta NUMERIC;
  receipt JSONB;
  transfer_rows JSONB;
  affected_group_ids JSONB;
BEGIN
  SELECT u.id
  INTO app_user_id
  FROM public.users u
  WHERE u.auth_user_id = (SELECT auth.uid())
  LIMIT 1;

  IF app_user_id IS NULL THEN
    RAISE EXCEPTION 'SETTLEMENT_UNAUTHENTICATED';
  END IF;

  IF jsonb_typeof(COALESCE(p_transfers, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'SETTLEMENT_TRANSFERS_INVALID';
  END IF;

  receipt := public.commit_settlement_operation(
    p_payment_intent_id,
    p_friend_id,
    p_group_id,
    p_mode,
    p_amount,
    p_currency,
    p_date,
    p_expected_balance,
    p_allocations,
    p_transfers
  );
  settlement_operation_block.operation_id := NULLIF(receipt->>'operationId', '')::UUID;

  IF settlement_operation_block.operation_id IS NULL THEN
    RAISE EXCEPTION 'SETTLEMENT_OPERATION_INVALID';
  END IF;

  FOR transfer IN SELECT value FROM jsonb_array_elements(COALESCE(p_transfers, '[]'::jsonb))
  LOOP
    transfer_group_id := NULLIF(transfer->>'groupId', '')::UUID;
    transfer_from_user_id := NULLIF(transfer->>'fromUserId', '')::UUID;
    transfer_to_user_id := NULLIF(transfer->>'toUserId', '')::UUID;
    transfer_currency := transfer->>'currency';
    transfer_delta := (transfer->>'signedGroupBalanceDelta')::NUMERIC;

    IF transfer_group_id IS NULL
       OR transfer_from_user_id IS NULL
       OR transfer_to_user_id IS NULL
       OR transfer_from_user_id = transfer_to_user_id
       OR transfer_from_user_id NOT IN (app_user_id, p_friend_id)
       OR transfer_to_user_id NOT IN (app_user_id, p_friend_id)
       OR transfer_currency <> p_currency
       OR transfer_delta IS NULL
       OR transfer_delta = 0
       OR transfer_delta <> ROUND(transfer_delta, 2) THEN
      RAISE EXCEPTION 'SETTLEMENT_TRANSFER_INVALID';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.group_members actor_member
      JOIN public.group_members friend_member
        ON friend_member.group_id = actor_member.group_id
       AND friend_member.user_id = p_friend_id
      WHERE actor_member.group_id = transfer_group_id
        AND actor_member.user_id = app_user_id
    ) THEN
      RAISE EXCEPTION 'SETTLEMENT_GROUP_SCOPE_INVALID';
    END IF;

    INSERT INTO public.settlement_scope_transfers (
      operation_id,
      group_id,
      from_user_id,
      to_user_id,
      currency,
      signed_group_balance_delta,
      note
    )
    VALUES (
      settlement_operation_block.operation_id,
      transfer_group_id,
      transfer_from_user_id,
      transfer_to_user_id,
      transfer_currency,
      transfer_delta,
      NULLIF(transfer->>'note', '')
    )
    ON CONFLICT ON CONSTRAINT settlement_scope_transfers_operation_group_key DO NOTHING;
  END LOOP;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', t.id,
      'operationId', t.operation_id,
      'groupId', t.group_id,
      'fromUserId', t.from_user_id,
      'toUserId', t.to_user_id,
      'currency', t.currency,
      'signedGroupBalanceDelta', t.signed_group_balance_delta,
      'note', t.note,
      'createdAt', t.created_at
    ) ORDER BY t.created_at, t.id
  ), '[]'::jsonb)
  INTO transfer_rows
  FROM public.settlement_scope_transfers t
  WHERE t.operation_id = settlement_operation_block.operation_id;

  SELECT COALESCE(jsonb_agg(group_id ORDER BY group_id), '[]'::jsonb)
  INTO affected_group_ids
  FROM (
    SELECT DISTINCT s.group_id
    FROM public.settlements s
    WHERE s.operation_id = settlement_operation_block.operation_id
      AND s.group_id IS NOT NULL
    UNION
    SELECT DISTINCT t.group_id
    FROM public.settlement_scope_transfers t
    WHERE t.operation_id = settlement_operation_block.operation_id
  ) groups;

  RETURN receipt || jsonb_build_object(
    'transfers', transfer_rows,
    'affectedGroupIds', affected_group_ids
  );
END;
$$;

REVOKE ALL ON FUNCTION public.commit_settlement_operation(UUID, UUID, UUID, TEXT, NUMERIC, TEXT, TIMESTAMPTZ, NUMERIC, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.commit_settlement_operation(UUID, UUID, UUID, TEXT, NUMERIC, TEXT, TIMESTAMPTZ, NUMERIC, JSONB, JSONB) TO authenticated;
