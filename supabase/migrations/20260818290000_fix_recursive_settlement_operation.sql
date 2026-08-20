-- The previous migration accidentally replaced commit_settlement_operation with
-- a wrapper that called itself. Keep the operation and transfer work in one
-- function so the RPC has a single, non-recursive execution path.

DROP FUNCTION IF EXISTS public.commit_settlement_operation(
  UUID, UUID, UUID, TEXT, NUMERIC, TEXT, TIMESTAMPTZ, NUMERIC, JSONB, JSONB
);

CREATE FUNCTION public.commit_settlement_operation(
  p_payment_intent_id UUID,
  p_friend_id UUID,
  p_group_id UUID,
  p_mode TEXT,
  p_amount NUMERIC,
  p_currency TEXT,
  p_date TIMESTAMPTZ,
  p_expected_balance NUMERIC,
  p_allocations JSONB,
  p_transfers JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  app_user_id UUID;
  new_operation_id UUID;
  commitment_row_id UUID;
  existing_operation public.settlement_operations%ROWTYPE;
  receipt JSONB;
  allocation JSONB;
  allocation_group_id UUID;
  transfer JSONB;
  transfer_group_id UUID;
  transfer_from_user_id UUID;
  transfer_to_user_id UUID;
  transfer_currency TEXT;
  transfer_delta NUMERIC;
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

  IF p_mode NOT IN ('all_balances', 'group') THEN
    RAISE EXCEPTION 'SETTLEMENT_MODE_INVALID';
  END IF;

  IF p_mode = 'all_balances' AND p_group_id IS NOT NULL THEN
    RAISE EXCEPTION 'SETTLEMENT_GROUP_SCOPE_INVALID';
  END IF;

  IF p_mode = 'group' AND p_group_id IS NULL THEN
    RAISE EXCEPTION 'SETTLEMENT_GROUP_REQUIRED';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 OR p_amount <> ROUND(p_amount, 2) THEN
    RAISE EXCEPTION 'SETTLEMENT_AMOUNT_INVALID';
  END IF;

  IF p_expected_balance IS NULL OR p_expected_balance <> ROUND(p_expected_balance, 2) THEN
    RAISE EXCEPTION 'SETTLEMENT_STALE_BALANCE';
  END IF;

  IF p_currency IS NULL OR BTRIM(p_currency) = '' THEN
    RAISE EXCEPTION 'SETTLEMENT_CURRENCY_REQUIRED';
  END IF;

  IF jsonb_typeof(p_allocations) <> 'array' OR jsonb_array_length(p_allocations) = 0 THEN
    RAISE EXCEPTION 'SETTLEMENT_ALLOCATIONS_REQUIRED';
  END IF;

  IF jsonb_typeof(COALESCE(p_transfers, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'SETTLEMENT_TRANSFERS_INVALID';
  END IF;

  IF p_mode = 'group' AND NOT EXISTS (
    SELECT 1
    FROM public.group_members actor_member
    JOIN public.group_members friend_member
      ON friend_member.group_id = actor_member.group_id
     AND friend_member.user_id = p_friend_id
    WHERE actor_member.group_id = p_group_id
      AND actor_member.user_id = app_user_id
  ) THEN
    RAISE EXCEPTION 'SETTLEMENT_GROUP_SCOPE_INVALID';
  END IF;

  FOR allocation IN SELECT value FROM jsonb_array_elements(p_allocations)
  LOOP
    allocation_group_id := NULLIF(allocation->>'groupId', '')::UUID;

    IF p_mode = 'group' AND allocation_group_id IS DISTINCT FROM p_group_id THEN
      RAISE EXCEPTION 'SETTLEMENT_GROUP_SCOPE_INVALID';
    END IF;

    IF p_mode = 'all_balances' AND allocation_group_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.group_members actor_member
        JOIN public.group_members friend_member
          ON friend_member.group_id = actor_member.group_id
         AND friend_member.user_id = p_friend_id
        WHERE actor_member.group_id = allocation_group_id
          AND actor_member.user_id = app_user_id
      ) THEN
        RAISE EXCEPTION 'SETTLEMENT_GROUP_SCOPE_INVALID';
      END IF;
    END IF;
  END LOOP;

  INSERT INTO public.settlement_operations (
    actor_user_id,
    friend_user_id,
    group_id,
    mode,
    currency,
    expected_balance,
    requested_payment_amount,
    payment_intent_id
  )
  VALUES (
    app_user_id,
    p_friend_id,
    p_group_id,
    p_mode,
    p_currency,
    p_expected_balance,
    p_amount,
    p_payment_intent_id
  )
  ON CONFLICT (actor_user_id, payment_intent_id) DO NOTHING
  RETURNING id INTO new_operation_id;

  IF new_operation_id IS NULL THEN
    SELECT *
    INTO existing_operation
    FROM public.settlement_operations
    WHERE actor_user_id = app_user_id
      AND payment_intent_id = p_payment_intent_id
    FOR UPDATE;

    IF existing_operation.friend_user_id <> p_friend_id
       OR existing_operation.group_id IS DISTINCT FROM p_group_id
       OR existing_operation.mode <> p_mode
       OR existing_operation.requested_payment_amount <> p_amount
       OR existing_operation.currency <> p_currency
       OR existing_operation.expected_balance <> p_expected_balance THEN
      RAISE EXCEPTION 'SETTLEMENT_PAYMENT_INTENT_REUSED_WITH_DIFFERENT_PAYMENT';
    END IF;

    new_operation_id := existing_operation.id;
  END IF;

  receipt := public.commit_combined_settlement(
    p_payment_intent_id,
    p_friend_id,
    p_amount,
    p_currency,
    p_date,
    p_expected_balance,
    p_allocations,
    p_transfers
  );

  SELECT sc.id
  INTO commitment_row_id
  FROM public.settlement_commitments sc
  WHERE sc.actor_user_id = app_user_id
    AND sc.payment_intent_id = p_payment_intent_id;

  UPDATE public.settlements
  SET operation_id = new_operation_id
  WHERE settlements.commitment_id = commitment_row_id
    AND operation_id IS NULL;

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
      new_operation_id,
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
  WHERE t.operation_id = new_operation_id;

  SELECT COALESCE(jsonb_agg(group_id ORDER BY group_id), '[]'::jsonb)
  INTO affected_group_ids
  FROM (
    SELECT DISTINCT s.group_id
    FROM public.settlements s
    WHERE s.operation_id = new_operation_id
      AND s.group_id IS NOT NULL
    UNION
    SELECT DISTINCT t.group_id
    FROM public.settlement_scope_transfers t
    WHERE t.operation_id = new_operation_id
  ) groups;

  RETURN receipt || jsonb_build_object(
    'operationId', new_operation_id,
    'mode', p_mode,
    'affectedGroupIds', affected_group_ids,
    'transfers', transfer_rows
  );
END;
$$;

REVOKE ALL ON FUNCTION public.commit_settlement_operation(UUID, UUID, UUID, TEXT, NUMERIC, TEXT, TIMESTAMPTZ, NUMERIC, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.commit_settlement_operation(UUID, UUID, UUID, TEXT, NUMERIC, TEXT, TIMESTAMPTZ, NUMERIC, JSONB, JSONB) TO authenticated;
