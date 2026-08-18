-- Align the settlement commit RPCs with ADR-0001 cross-scope transfers.
-- Scope transfers reclassify group balances into the direct friendship ledger.
-- Allocation validation must use the transfer-adjusted scope balances so that
-- opposite-direction direct and group balances can be settled in one operation.

DROP FUNCTION IF EXISTS public.commit_settlement_operation(UUID, UUID, UUID, TEXT, NUMERIC, TEXT, TIMESTAMPTZ, NUMERIC, JSONB, JSONB);
DROP FUNCTION IF EXISTS public.commit_settlement_operation(UUID, UUID, UUID, TEXT, NUMERIC, TEXT, TIMESTAMPTZ, NUMERIC, JSONB);
DROP FUNCTION IF EXISTS public.commit_combined_settlement(UUID, UUID, NUMERIC, TEXT, TIMESTAMPTZ, NUMERIC, JSONB, JSONB);
DROP FUNCTION IF EXISTS public.commit_combined_settlement(UUID, UUID, NUMERIC, TEXT, TIMESTAMPTZ, JSONB);

CREATE OR REPLACE FUNCTION public.commit_combined_settlement(
  p_payment_intent_id UUID,
  p_friend_id UUID,
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
  new_commitment_id UUID;
  existing_commitment public.settlement_commitments%ROWTYPE;
  allocation JSONB;
  allocation_group_id UUID;
  allocation_from_user_id UUID;
  allocation_to_user_id UUID;
  allocation_amount NUMERIC;
  allocation_currency TEXT;
  allocation_total NUMERIC := 0;
  current_balance NUMERIC := 0;
  current_scope_balance NUMERIC := 0;
  direct_scope_seen BOOLEAN := FALSE;
  seen_group_ids TEXT[] := ARRAY[]::TEXT[];
  settlement_rows JSONB;
  settlement_direction TEXT;
  commitment_created_at TIMESTAMPTZ;
  transfer JSONB;
  transfer_group_id UUID;
  transfer_delta NUMERIC;
  transfer_deltas_by_group JSONB := '{}'::jsonb;
  direct_transfer_delta NUMERIC := 0;
BEGIN
  SELECT u.id
  INTO app_user_id
  FROM public.users u
  WHERE u.auth_user_id = (SELECT auth.uid())
  LIMIT 1;

  IF app_user_id IS NULL THEN
    RAISE EXCEPTION 'SETTLEMENT_UNAUTHENTICATED';
  END IF;

  IF p_payment_intent_id IS NULL THEN
    RAISE EXCEPTION 'SETTLEMENT_PAYMENT_INTENT_REQUIRED';
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

  IF BTRIM(p_currency) <> 'USD' THEN
    RAISE EXCEPTION 'SETTLEMENT_CURRENCY_UNSUPPORTED';
  END IF;

  IF jsonb_typeof(p_allocations) <> 'array' OR jsonb_array_length(p_allocations) = 0 THEN
    RAISE EXCEPTION 'SETTLEMENT_ALLOCATIONS_REQUIRED';
  END IF;

  IF jsonb_typeof(COALESCE(p_transfers, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'SETTLEMENT_TRANSFERS_INVALID';
  END IF;

  FOR transfer IN SELECT value FROM jsonb_array_elements(COALESCE(p_transfers, '[]'::jsonb))
  LOOP
    transfer_group_id := NULLIF(transfer->>'groupId', '')::UUID;
    transfer_delta := (transfer->>'signedGroupBalanceDelta')::NUMERIC;

    IF transfer_group_id IS NULL
       OR transfer_delta IS NULL
       OR transfer_delta = 0
       OR transfer_delta <> ROUND(transfer_delta, 2) THEN
      RAISE EXCEPTION 'SETTLEMENT_TRANSFER_INVALID';
    END IF;

    transfer_deltas_by_group := jsonb_set(
      transfer_deltas_by_group,
      ARRAY[transfer_group_id::TEXT],
      to_jsonb(COALESCE((transfer_deltas_by_group->>transfer_group_id::TEXT)::numeric, 0) + transfer_delta)
    );
    direct_transfer_delta := direct_transfer_delta + transfer_delta;
  END LOOP;

  INSERT INTO public.settlement_commitments (
    payment_intent_id,
    actor_user_id,
    friend_user_id,
    amount,
    currency,
    date
  )
  VALUES (
    p_payment_intent_id,
    app_user_id,
    p_friend_id,
    p_amount,
    p_currency,
    p_date
  )
  ON CONFLICT (actor_user_id, payment_intent_id) DO NOTHING
  RETURNING id INTO new_commitment_id;

  IF new_commitment_id IS NULL THEN
    SELECT *
    INTO existing_commitment
    FROM public.settlement_commitments
    WHERE actor_user_id = app_user_id
      AND payment_intent_id = p_payment_intent_id
    FOR UPDATE;

    IF existing_commitment.friend_user_id <> p_friend_id
       OR existing_commitment.amount <> p_amount
       OR existing_commitment.currency <> p_currency THEN
      RAISE EXCEPTION 'SETTLEMENT_PAYMENT_INTENT_REUSED_WITH_DIFFERENT_PAYMENT';
    END IF;

    settlement_rows := private.settlement_commitment_rows(existing_commitment.id);
    settlement_direction := CASE
      WHEN settlement_rows->0->>'fromUserId' = app_user_id::TEXT THEN 'you_paid_friend'
      ELSE 'friend_paid_you'
    END;

    RETURN jsonb_build_object(
      'paymentIntentId', p_payment_intent_id,
      'reused', true,
      'committedAt', existing_commitment.created_at,
      'totalAmount', existing_commitment.amount,
      'currency', existing_commitment.currency,
      'direction', settlement_direction,
      'settlements', settlement_rows
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.friendships f
    WHERE f.status = 'accepted'
      AND (
        (f.user_id = app_user_id AND f.friend_id = p_friend_id)
        OR (f.user_id = p_friend_id AND f.friend_id = app_user_id)
      )
  ) THEN
    RAISE EXCEPTION 'SETTLEMENT_FRIENDSHIP_REQUIRED';
  END IF;

  PERFORM 1
  FROM public.users u
  WHERE u.id IN (app_user_id, p_friend_id)
  ORDER BY u.id
  FOR UPDATE;

  SELECT COALESCE((
    SELECT SUM(
      CASE
        WHEN e.paid_by = app_user_id THEN COALESCE(friend_split.amount, 0)
        WHEN e.paid_by = p_friend_id THEN -COALESCE(current_split.amount, 0)
        ELSE 0
      END
    )
    FROM public.expenses e
    LEFT JOIN public.expense_splits current_split
      ON current_split.expense_id = e.id
     AND current_split.user_id = app_user_id
     AND (current_split.amount > 0 OR e.paid_by = app_user_id)
    LEFT JOIN public.expense_splits friend_split
      ON friend_split.expense_id = e.id
     AND friend_split.user_id = p_friend_id
     AND (friend_split.amount > 0 OR e.paid_by = p_friend_id)
    WHERE e.deleted_at IS NULL
      AND e.group_id IS NULL
      AND e.currency = p_currency
      AND (COALESCE(current_split.amount, 0) > 0 OR e.paid_by = app_user_id)
      AND (COALESCE(friend_split.amount, 0) > 0 OR e.paid_by = p_friend_id)
  ), 0)
  + COALESCE((
    SELECT SUM(CASE WHEN s.from_user_id = app_user_id THEN s.amount ELSE -s.amount END)
    FROM public.settlements s
    WHERE s.group_id IS NULL
      AND s.currency = p_currency
      AND (
        (s.from_user_id = app_user_id AND s.to_user_id = p_friend_id)
        OR (s.from_user_id = p_friend_id AND s.to_user_id = app_user_id)
      )
  ), 0)
  + COALESCE((
    SELECT SUM(COALESCE(friend_split.amount, 0) - CASE WHEN e.paid_by = p_friend_id THEN e.amount ELSE 0 END)
    FROM public.expenses e
    JOIN public.group_members current_member
      ON current_member.group_id = e.group_id
     AND current_member.user_id = app_user_id
    JOIN public.group_members friend_member
      ON friend_member.group_id = e.group_id
     AND friend_member.user_id = p_friend_id
    LEFT JOIN public.expense_splits friend_split
      ON friend_split.expense_id = e.id
     AND friend_split.user_id = p_friend_id
    WHERE e.deleted_at IS NULL
      AND e.currency = p_currency
  ), 0)
  + COALESCE((
    SELECT SUM(CASE
      WHEN s.from_user_id = p_friend_id THEN -s.amount
      WHEN s.to_user_id = p_friend_id THEN s.amount
      ELSE 0
    END)
    FROM public.settlements s
    JOIN public.group_members current_member
      ON current_member.group_id = s.group_id
     AND current_member.user_id = app_user_id
    JOIN public.group_members friend_member
      ON friend_member.group_id = s.group_id
     AND friend_member.user_id = p_friend_id
    WHERE s.currency = p_currency
  ), 0)
  INTO current_balance;

  IF ROUND(current_balance, 2) <> ROUND(p_expected_balance, 2) THEN
    RAISE EXCEPTION 'SETTLEMENT_STALE_BALANCE';
  END IF;

  FOR allocation IN SELECT value FROM jsonb_array_elements(p_allocations)
  LOOP
    allocation_group_id := NULLIF(allocation->>'groupId', '')::UUID;
    allocation_from_user_id := (allocation->>'fromUserId')::UUID;
    allocation_to_user_id := (allocation->>'toUserId')::UUID;
    allocation_amount := (allocation->>'amount')::NUMERIC;
    allocation_currency := allocation->>'currency';

    IF allocation_amount IS NULL
       OR allocation_amount <= 0
       OR allocation_amount <> ROUND(allocation_amount, 2)
       OR allocation_currency <> p_currency
       OR allocation_from_user_id = allocation_to_user_id
       OR allocation_from_user_id NOT IN (app_user_id, p_friend_id)
       OR allocation_to_user_id NOT IN (app_user_id, p_friend_id) THEN
      RAISE EXCEPTION 'SETTLEMENT_ALLOCATION_INVALID';
    END IF;

    IF allocation_group_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM public.group_members current_member
      JOIN public.group_members friend_member
        ON friend_member.group_id = current_member.group_id
       AND friend_member.user_id = p_friend_id
      WHERE current_member.group_id = allocation_group_id
        AND current_member.user_id = app_user_id
    ) THEN
      RAISE EXCEPTION 'SETTLEMENT_GROUP_SCOPE_INVALID';
    END IF;

    IF allocation_group_id IS NULL THEN
      IF direct_scope_seen THEN
        RAISE EXCEPTION 'SETTLEMENT_ALLOCATION_INVALID';
      END IF;
      direct_scope_seen := TRUE;
    ELSIF allocation_group_id::TEXT = ANY(seen_group_ids) THEN
      RAISE EXCEPTION 'SETTLEMENT_ALLOCATION_INVALID';
    ELSE
      seen_group_ids := array_append(seen_group_ids, allocation_group_id::TEXT);
    END IF;

    IF allocation_group_id IS NULL THEN
      SELECT COALESCE(SUM(
        CASE
          WHEN e.paid_by = app_user_id THEN COALESCE(friend_split.amount, 0)
          WHEN e.paid_by = p_friend_id THEN -COALESCE(current_split.amount, 0)
          ELSE 0
        END
      ), 0)
      INTO current_scope_balance
      FROM public.expenses e
      LEFT JOIN public.expense_splits current_split
        ON current_split.expense_id = e.id
       AND current_split.user_id = app_user_id
       AND (current_split.amount > 0 OR e.paid_by = app_user_id)
      LEFT JOIN public.expense_splits friend_split
        ON friend_split.expense_id = e.id
       AND friend_split.user_id = p_friend_id
       AND (friend_split.amount > 0 OR e.paid_by = p_friend_id)
      WHERE e.deleted_at IS NULL
        AND e.group_id IS NULL
        AND e.currency = p_currency
        AND (COALESCE(current_split.amount, 0) > 0 OR e.paid_by = app_user_id)
        AND (COALESCE(friend_split.amount, 0) > 0 OR e.paid_by = p_friend_id);

      current_scope_balance := current_scope_balance + COALESCE((
        SELECT SUM(CASE WHEN s.from_user_id = app_user_id THEN s.amount ELSE -s.amount END)
        FROM public.settlements s
        WHERE s.group_id IS NULL
          AND s.currency = p_currency
          AND (
            (s.from_user_id = app_user_id AND s.to_user_id = p_friend_id)
            OR (s.from_user_id = p_friend_id AND s.to_user_id = app_user_id)
          )
      ), 0);

      current_scope_balance := current_scope_balance - direct_transfer_delta;
    ELSE
      SELECT COALESCE(SUM(COALESCE(friend_split.amount, 0) - CASE WHEN e.paid_by = p_friend_id THEN e.amount ELSE 0 END), 0)
      + COALESCE((
        SELECT SUM(CASE
          WHEN s.from_user_id = p_friend_id THEN -s.amount
          WHEN s.to_user_id = p_friend_id THEN s.amount
          ELSE 0
        END)
        FROM public.settlements s
        WHERE s.group_id = allocation_group_id
          AND s.currency = p_currency
      ), 0)
      INTO current_scope_balance
      FROM public.expenses e
      LEFT JOIN public.expense_splits friend_split
        ON friend_split.expense_id = e.id
       AND friend_split.user_id = p_friend_id
      WHERE e.group_id = allocation_group_id
        AND e.deleted_at IS NULL
        AND e.currency = p_currency;

      current_scope_balance := current_scope_balance + COALESCE((transfer_deltas_by_group->>allocation_group_id::TEXT)::numeric, 0);
    END IF;

    IF current_scope_balance = 0
       OR (current_scope_balance > 0 AND allocation_from_user_id <> p_friend_id)
       OR (current_scope_balance < 0 AND allocation_from_user_id <> app_user_id) THEN
      RAISE EXCEPTION 'SETTLEMENT_ALLOCATION_DIRECTION_INVALID';
    END IF;

    IF allocation_amount > ABS(current_scope_balance) THEN
      RAISE EXCEPTION 'SETTLEMENT_ALLOCATION_OVER_BALANCE';
    END IF;

    allocation_total := allocation_total + allocation_amount;

    IF settlement_direction IS NULL THEN
      settlement_direction := CASE
        WHEN allocation_from_user_id = app_user_id THEN 'you_paid_friend'
        ELSE 'friend_paid_you'
      END;
    END IF;

    INSERT INTO public.settlements (
      group_id,
      from_user_id,
      to_user_id,
      amount,
      currency,
      date,
      commitment_id
    )
    VALUES (
      allocation_group_id,
      allocation_from_user_id,
      allocation_to_user_id,
      allocation_amount,
      allocation_currency,
      p_date,
      new_commitment_id
    );
  END LOOP;

  IF allocation_total <> p_amount THEN
    RAISE EXCEPTION 'SETTLEMENT_ALLOCATION_TOTAL_MISMATCH';
  END IF;

  settlement_rows := private.settlement_commitment_rows(new_commitment_id);
  SELECT created_at INTO commitment_created_at
  FROM public.settlement_commitments
  WHERE id = new_commitment_id;

  RETURN jsonb_build_object(
    'paymentIntentId', p_payment_intent_id,
    'reused', false,
    'committedAt', commitment_created_at,
    'totalAmount', p_amount,
    'currency', p_currency,
    'direction', settlement_direction,
    'settlements', settlement_rows
  );
END;
$$;

REVOKE ALL ON FUNCTION public.commit_combined_settlement(UUID, UUID, NUMERIC, TEXT, TIMESTAMPTZ, NUMERIC, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.commit_combined_settlement(UUID, UUID, NUMERIC, TEXT, TIMESTAMPTZ, NUMERIC, JSONB, JSONB) TO authenticated;

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
  affected_group_ids UUID[];
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

  IF jsonb_typeof(p_allocations) <> 'array' OR jsonb_array_length(p_allocations) = 0 THEN
    RAISE EXCEPTION 'SETTLEMENT_ALLOCATIONS_REQUIRED';
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

  SELECT ARRAY(
    SELECT DISTINCT s.group_id
    FROM public.settlements s
    WHERE s.operation_id = new_operation_id
      AND s.group_id IS NOT NULL
  )
  INTO affected_group_ids;

  RETURN receipt || jsonb_build_object(
    'operationId', new_operation_id,
    'mode', p_mode,
    'affectedGroupIds', COALESCE(to_jsonb(affected_group_ids), '[]'::jsonb),
    'transfers', '[]'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.commit_settlement_operation(UUID, UUID, UUID, TEXT, NUMERIC, TEXT, TIMESTAMPTZ, NUMERIC, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.commit_settlement_operation(UUID, UUID, UUID, TEXT, NUMERIC, TEXT, TIMESTAMPTZ, NUMERIC, JSONB, JSONB) TO authenticated;

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
  p_transfers JSONB DEFAULT '[]'::jsonb
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
