-- Keep settlement commits behind the operation RPC. The legacy combined RPC
-- remains an internal implementation detail and must not be callable through
-- PostgREST.

ALTER TABLE public.settlement_operations
  ADD COLUMN IF NOT EXISTS request_fingerprint TEXT;

DROP FUNCTION IF EXISTS public.commit_combined_settlement(
  UUID, UUID, NUMERIC, TEXT, TIMESTAMPTZ, JSONB
);

REVOKE ALL ON FUNCTION public.commit_combined_settlement(
  UUID, UUID, NUMERIC, TEXT, TIMESTAMPTZ, NUMERIC, JSONB, JSONB
) FROM PUBLIC, anon, authenticated, service_role;

ALTER FUNCTION public.commit_settlement_operation(
  UUID, UUID, UUID, TEXT, NUMERIC, TEXT, TIMESTAMPTZ, NUMERIC, JSONB, JSONB
) RENAME TO commit_settlement_operation_internal;

REVOKE ALL ON FUNCTION public.commit_settlement_operation_internal(
  UUID, UUID, UUID, TEXT, NUMERIC, TEXT, TIMESTAMPTZ, NUMERIC, JSONB, JSONB
) FROM PUBLIC, anon, authenticated, service_role;

-- The wrapper needs to persist the fingerprint after the internal operation
-- creates or reuses the operation. Use a trigger-local setting so the
-- internal implementation remains unchanged.
CREATE OR REPLACE FUNCTION public.set_settlement_operation_fingerprint()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_fingerprint TEXT;
BEGIN
  v_fingerprint := NULLIF(current_setting('vasuli.settlement_request_fingerprint', true), '');
  IF NEW.request_fingerprint IS NULL AND v_fingerprint IS NOT NULL THEN
    NEW.request_fingerprint := v_fingerprint;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_settlement_operation_fingerprint
  ON public.settlement_operations;
CREATE TRIGGER set_settlement_operation_fingerprint
BEFORE INSERT ON public.settlement_operations
FOR EACH ROW
EXECUTE FUNCTION public.set_settlement_operation_fingerprint();

-- Recreate the wrapper with a transaction-local fingerprint around the
-- internal call. This is separate from the trigger definition so the value is
-- never persisted for an unrelated insert.
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
  existing_operation public.settlement_operations%ROWTYPE;
  receipt JSONB;
  v_request_fingerprint TEXT;
  operation_id UUID;
BEGIN
  SELECT u.id INTO app_user_id FROM public.users u
  WHERE u.auth_user_id = (SELECT auth.uid()) LIMIT 1;
  IF app_user_id IS NULL THEN RAISE EXCEPTION 'SETTLEMENT_UNAUTHENTICATED'; END IF;

  v_request_fingerprint := md5(jsonb_build_object(
    'friendId', p_friend_id, 'groupId', p_group_id, 'mode', p_mode,
    'amount', p_amount, 'currency', p_currency, 'date', p_date,
    'expectedBalance', p_expected_balance, 'allocations', p_allocations,
    'transfers', COALESCE(p_transfers, '[]'::jsonb)
  )::TEXT);

  SELECT * INTO existing_operation FROM public.settlement_operations
  WHERE actor_user_id = app_user_id AND payment_intent_id = p_payment_intent_id
  FOR UPDATE;
  IF existing_operation.id IS NOT NULL
     AND existing_operation.request_fingerprint IS NOT NULL
     AND existing_operation.request_fingerprint <> v_request_fingerprint THEN
    RAISE EXCEPTION 'SETTLEMENT_PAYMENT_INTENT_REUSED_WITH_DIFFERENT_PAYMENT';
  END IF;

  PERFORM set_config('vasuli.settlement_request_fingerprint', v_request_fingerprint, true);
  receipt := public.commit_settlement_operation_internal(
    p_payment_intent_id, p_friend_id, p_group_id, p_mode, p_amount,
    p_currency, p_date, p_expected_balance, p_allocations, p_transfers
  );
  operation_id := NULLIF(receipt->>'operationId', '')::UUID;
  IF operation_id IS NULL THEN RAISE EXCEPTION 'SETTLEMENT_OPERATION_INVALID'; END IF;

  UPDATE public.settlement_operations
  SET request_fingerprint = COALESCE(
    public.settlement_operations.request_fingerprint,
    v_request_fingerprint
  )
  WHERE id = operation_id;
  RETURN receipt;
END;
$$;

REVOKE ALL ON FUNCTION public.commit_settlement_operation(
  UUID, UUID, UUID, TEXT, NUMERIC, TEXT, TIMESTAMPTZ, NUMERIC, JSONB, JSONB
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.commit_settlement_operation(
  UUID, UUID, UUID, TEXT, NUMERIC, TEXT, TIMESTAMPTZ, NUMERIC, JSONB, JSONB
) TO authenticated;

-- Validate that every non-reversal scope transfer cancels the server-side
-- group balance. This prevents a caller from supplying an arbitrary offset
-- that only makes allocation validation appear to pass.
CREATE OR REPLACE FUNCTION public.validate_settlement_scope_transfer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  operation_row public.settlement_operations%ROWTYPE;
  actor_balance NUMERIC;
BEGIN
  IF NEW.is_reversal THEN RETURN NEW; END IF;

  SELECT * INTO operation_row
  FROM public.settlement_operations
  WHERE id = NEW.operation_id;
  IF operation_row.id IS NULL THEN RAISE EXCEPTION 'SETTLEMENT_OPERATION_INVALID'; END IF;

  SELECT COALESCE(SUM(COALESCE(friend_split.amount, 0)
      - CASE WHEN e.paid_by = operation_row.friend_user_id THEN e.amount ELSE 0 END), 0)
    + COALESCE((
      SELECT SUM(CASE
        WHEN s.from_user_id = operation_row.friend_user_id THEN -s.amount
        WHEN s.to_user_id = operation_row.friend_user_id THEN s.amount
        ELSE 0 END)
      FROM public.settlements s
      WHERE s.group_id = NEW.group_id AND s.currency = NEW.currency
    ), 0)
    + COALESCE((
      SELECT SUM(CASE
        WHEN t.from_user_id = operation_row.actor_user_id THEN -t.signed_group_balance_delta
        WHEN t.to_user_id = operation_row.actor_user_id THEN t.signed_group_balance_delta
        ELSE 0 END)
      FROM public.settlement_scope_transfers t
      WHERE t.group_id = NEW.group_id
        AND t.currency = NEW.currency
        AND NOT t.is_reversal
    ), 0)
  INTO actor_balance
  FROM public.expenses e
  LEFT JOIN public.expense_splits friend_split
    ON friend_split.expense_id = e.id
   AND friend_split.user_id = operation_row.friend_user_id
  JOIN public.group_members actor_member
    ON actor_member.group_id = e.group_id
   AND actor_member.user_id = operation_row.actor_user_id
  JOIN public.group_members friend_member
    ON friend_member.group_id = e.group_id
   AND friend_member.user_id = operation_row.friend_user_id
  WHERE e.deleted_at IS NULL
    AND e.group_id = NEW.group_id
    AND e.currency = NEW.currency;

  IF ROUND(NEW.signed_group_balance_delta, 2)
     <> ROUND(-COALESCE(actor_balance, 0), 2) THEN
    RAISE EXCEPTION 'SETTLEMENT_TRANSFER_BALANCE_MISMATCH';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_settlement_scope_transfer
  ON public.settlement_scope_transfers;
CREATE TRIGGER validate_settlement_scope_transfer
BEFORE INSERT ON public.settlement_scope_transfers
FOR EACH ROW
EXECUTE FUNCTION public.validate_settlement_scope_transfer();

REVOKE ALL ON FUNCTION public.set_settlement_operation_fingerprint() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_settlement_scope_transfer() FROM PUBLIC, anon, authenticated, service_role;
