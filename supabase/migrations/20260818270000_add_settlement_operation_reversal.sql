-- Reverse a settlement operation as one atomic, auditable ledger action.
-- Original rows remain untouched; compensating rows cancel their financial
-- effect and are linked to the same operation for history and projections.

ALTER TABLE public.settlement_scope_transfers
  ADD COLUMN IF NOT EXISTS is_reversal BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.settlement_scope_transfers
  DROP CONSTRAINT IF EXISTS settlement_scope_transfers_operation_group_key;

DROP INDEX IF EXISTS public.idx_settlement_scope_transfers_operation_group;

ALTER TABLE public.settlement_scope_transfers
  ADD CONSTRAINT settlement_scope_transfers_operation_group_key
  UNIQUE (operation_id, group_id, is_reversal);

CREATE TABLE IF NOT EXISTS public.settlement_operation_reversals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id UUID NOT NULL UNIQUE REFERENCES public.settlement_operations(id) ON DELETE RESTRICT,
  actor_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_settlement_operation_reversals_operation
  ON public.settlement_operation_reversals(operation_id);

ALTER TABLE public.settlement_operation_reversals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.settlement_operation_reversals FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.reverse_settlement_operation(
  p_operation_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  app_user_id UUID;
  operation_row public.settlement_operations%ROWTYPE;
  reversal_row public.settlement_operation_reversals%ROWTYPE;
  reversal_settlement_count INTEGER := 0;
BEGIN
  SELECT u.id
  INTO app_user_id
  FROM public.users u
  WHERE u.auth_user_id = (SELECT auth.uid())
  LIMIT 1;

  IF app_user_id IS NULL THEN
    RAISE EXCEPTION 'SETTLEMENT_UNAUTHENTICATED';
  END IF;

  SELECT *
  INTO operation_row
  FROM public.settlement_operations
  WHERE id = p_operation_id
  FOR UPDATE;

  IF operation_row.id IS NULL THEN
    RAISE EXCEPTION 'SETTLEMENT_OPERATION_NOT_FOUND';
  END IF;

  IF app_user_id <> operation_row.actor_user_id
     AND app_user_id <> operation_row.friend_user_id THEN
    RAISE EXCEPTION 'SETTLEMENT_REVERSAL_UNAUTHORIZED';
  END IF;

  IF operation_row.status = 'reversed' THEN
    SELECT *
    INTO reversal_row
    FROM public.settlement_operation_reversals
    WHERE operation_id = operation_row.id;

    RETURN jsonb_build_object(
      'operationId', operation_row.id,
      'status', 'reversed',
      'reversedAt', reversal_row.created_at,
      'reused', true
    );
  END IF;

  IF operation_row.status <> 'committed' THEN
    RAISE EXCEPTION 'SETTLEMENT_OPERATION_INVALID_STATUS';
  END IF;

  INSERT INTO public.settlement_operation_reversals (operation_id, actor_user_id)
  VALUES (operation_row.id, app_user_id)
  RETURNING * INTO reversal_row;

  INSERT INTO public.settlements (
    group_id,
    from_user_id,
    to_user_id,
    amount,
    currency,
    date,
    notes,
    operation_id
  )
  SELECT
    s.group_id,
    s.to_user_id,
    s.from_user_id,
    s.amount,
    s.currency,
    NOW(),
    'Reversal of settlement operation ' || operation_row.id,
    s.operation_id
  FROM public.settlements s
  WHERE s.operation_id = operation_row.id;

  GET DIAGNOSTICS reversal_settlement_count = ROW_COUNT;

  INSERT INTO public.settlement_scope_transfers (
    operation_id,
    group_id,
    from_user_id,
    to_user_id,
    currency,
    signed_group_balance_delta,
    note,
    is_reversal
  )
  SELECT
    t.operation_id,
    t.group_id,
    t.to_user_id,
    t.from_user_id,
    t.currency,
    -t.signed_group_balance_delta,
    'Reversal of settlement operation ' || operation_row.id,
    true
  FROM public.settlement_scope_transfers t
  WHERE t.operation_id = operation_row.id
    AND t.is_reversal = false;

  UPDATE public.settlement_operations
  SET status = 'reversed', reversed_at = reversal_row.created_at
  WHERE id = operation_row.id;

  RETURN jsonb_build_object(
    'operationId', operation_row.id,
    'status', 'reversed',
    'reversedAt', reversal_row.created_at,
    'reused', false,
    'reversalSettlementCount', reversal_settlement_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_settlement_operation(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reverse_settlement_operation(UUID) TO authenticated;
