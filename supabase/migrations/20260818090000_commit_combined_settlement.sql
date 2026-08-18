-- Commit a combined Friend payment as one idempotent database transaction.
-- The client supplies a deterministic allocation plan; this function validates
-- the participants, scopes, currency, and exact total before writing rows.
-- The active Supabase schema uses UUID app-domain IDs. The older 001 migration
-- is a legacy text-ID bootstrap and is not the schema contract for this RPC.

CREATE TABLE IF NOT EXISTS public.settlement_commitments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_intent_id UUID NOT NULL,
  actor_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  friend_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL,
  date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (actor_user_id, payment_intent_id)
);

ALTER TABLE public.settlements
  ADD COLUMN IF NOT EXISTS commitment_id UUID
  REFERENCES public.settlement_commitments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_settlements_commitment_id
  ON public.settlements(commitment_id);

ALTER TABLE public.settlement_commitments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.settlement_commitments FROM PUBLIC, anon, authenticated;

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.settlement_commitment_rows(p_commitment_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', s.id,
      'groupId', s.group_id,
      'fromUserId', s.from_user_id,
      'toUserId', s.to_user_id,
      'amount', s.amount,
      'currency', s.currency,
      'date', s.date,
      'notes', s.notes,
      'createdAt', s.created_at
    ) ORDER BY s.created_at, s.id
  ), '[]'::jsonb)
  FROM public.settlements s
  WHERE s.commitment_id = p_commitment_id;
$$;

REVOKE ALL ON FUNCTION private.settlement_commitment_rows(UUID) FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.commit_combined_settlement(UUID, UUID, NUMERIC, TEXT, TIMESTAMPTZ, JSONB);

CREATE OR REPLACE FUNCTION public.commit_combined_settlement(
  p_payment_intent_id UUID,
  p_friend_id UUID,
  p_amount NUMERIC,
  p_currency TEXT,
  p_date TIMESTAMPTZ,
  p_expected_balance NUMERIC,
  p_allocations JSONB
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

  -- Serialize all settlement commits for this pair. A second payment intent
  -- waits for the first transaction, then observes its newly committed balance
  -- and fails the expected-balance check instead of over-settling.
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

REVOKE ALL ON FUNCTION public.commit_combined_settlement(UUID, UUID, NUMERIC, TEXT, TIMESTAMPTZ, NUMERIC, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.commit_combined_settlement(UUID, UUID, NUMERIC, TEXT, TIMESTAMPTZ, NUMERIC, JSONB) TO authenticated;
