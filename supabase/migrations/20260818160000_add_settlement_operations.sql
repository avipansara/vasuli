-- Add an operation-level audit boundary around the existing combined settlement
-- transaction. Existing settlement_commitments remain intact for compatibility;
-- new callers receive an explicit operation parent and operation-linked payments.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.settlement_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  friend_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  group_id UUID REFERENCES public.groups(id) ON DELETE RESTRICT,
  mode TEXT NOT NULL CHECK (mode IN ('all_balances', 'group')),
  currency TEXT NOT NULL,
  expected_balance NUMERIC(12, 2) NOT NULL,
  requested_payment_amount NUMERIC(12, 2) NOT NULL CHECK (requested_payment_amount >= 0),
  payment_intent_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'committed' CHECK (status IN ('committed', 'reversed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reversed_at TIMESTAMPTZ,
  UNIQUE (actor_user_id, payment_intent_id),
  CHECK (actor_user_id <> friend_user_id),
  CHECK ((mode = 'all_balances' AND group_id IS NULL) OR (mode = 'group' AND group_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.settlement_scope_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id UUID NOT NULL REFERENCES public.settlement_operations(id) ON DELETE RESTRICT,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE RESTRICT,
  from_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  to_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  currency TEXT NOT NULL,
  signed_group_balance_delta NUMERIC(12, 2) NOT NULL CHECK (signed_group_balance_delta <> 0),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (from_user_id <> to_user_id)
);

ALTER TABLE public.settlements
  ADD COLUMN IF NOT EXISTS operation_id UUID
  REFERENCES public.settlement_operations(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_settlement_operations_friend
  ON public.settlement_operations(friend_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_settlement_operations_group
  ON public.settlement_operations(group_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_settlement_operations_payment_intent
  ON public.settlement_operations(actor_user_id, payment_intent_id);

CREATE INDEX IF NOT EXISTS idx_settlement_scope_transfers_operation
  ON public.settlement_scope_transfers(operation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_settlement_scope_transfers_group
  ON public.settlement_scope_transfers(group_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_settlements_operation_id
  ON public.settlements(operation_id);

ALTER TABLE public.settlement_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_scope_transfers ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.settlement_operations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.settlement_scope_transfers FROM PUBLIC, anon, authenticated;

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
