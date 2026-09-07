-- ADR-0004 ticket 13: replace the blanket transfer freeze with the narrow
-- atomic full-friend-settlement contract.
--
-- This migration is additive. Existing operation, payment, and transfer rows
-- are retained. The public commit RPC recomputes every pair scope while the
-- actor/friend rows are locked in UUID order, validates the submitted plan
-- against that computation, and writes cash plus cancellation atomically.

-- Balance writers share transaction-scoped advisory locks for the users they
-- can affect. Pair locks acquire user keys in UUID order; group expense rows
-- lock their members in the same order, so unrelated groups remain parallel
-- while overlapping pair mutations serialize without deadlocks.
CREATE OR REPLACE FUNCTION private.settlement_user_write_lock(p_user_id UUID)
RETURNS VOID
LANGUAGE SQL
VOLATILE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
  SELECT pg_advisory_xact_lock(hashtextextended('vasuli.settlement.user:' || p_user_id::TEXT, 0));
$$;

CREATE OR REPLACE FUNCTION private.settlement_pair_write_lock(p_first_user_id UUID, p_second_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF p_first_user_id IS NULL OR p_second_user_id IS NULL THEN RETURN; END IF;
  IF p_first_user_id < p_second_user_id THEN
    PERFORM private.settlement_user_write_lock(p_first_user_id);
    PERFORM private.settlement_user_write_lock(p_second_user_id);
  ELSE
    PERFORM private.settlement_user_write_lock(p_second_user_id);
    PERFORM private.settlement_user_write_lock(p_first_user_id);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.settlement_user_write_lock(UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.settlement_pair_write_lock(UUID, UUID) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.serialize_settlement_balance_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  affected_user UUID;
BEGIN
  IF TG_TABLE_NAME = 'expenses' THEN
    FOR affected_user IN
      SELECT affected.user_id
      FROM (
        SELECT CASE WHEN TG_OP <> 'DELETE' THEN NEW.paid_by END AS user_id
        UNION
        SELECT CASE WHEN TG_OP <> 'INSERT' THEN OLD.paid_by END
        UNION
        SELECT gm.user_id
        FROM public.group_members gm
        WHERE TG_OP <> 'DELETE' AND NEW.group_id IS NOT NULL AND gm.group_id = NEW.group_id
        UNION
        SELECT gm.user_id
        FROM public.group_members gm
        WHERE TG_OP <> 'INSERT' AND OLD.group_id IS NOT NULL AND gm.group_id = OLD.group_id
      ) affected
      WHERE affected.user_id IS NOT NULL
      ORDER BY affected.user_id
    LOOP
      PERFORM private.settlement_user_write_lock(affected_user);
    END LOOP;
  ELSIF TG_TABLE_NAME = 'group_members' THEN
    FOR affected_user IN
      SELECT affected.user_id
      FROM (
        SELECT CASE WHEN TG_OP <> 'DELETE' THEN NEW.user_id END AS user_id
        UNION
        SELECT CASE WHEN TG_OP <> 'INSERT' THEN OLD.user_id END
        UNION
        SELECT gm.user_id
        FROM public.group_members gm
        WHERE TG_OP <> 'DELETE' AND gm.group_id = NEW.group_id
        UNION
        SELECT gm.user_id
        FROM public.group_members gm
        WHERE TG_OP <> 'INSERT' AND gm.group_id = OLD.group_id
      ) affected
      WHERE affected.user_id IS NOT NULL
      ORDER BY affected.user_id
    LOOP
      PERFORM private.settlement_user_write_lock(affected_user);
    END LOOP;
  ELSIF TG_TABLE_NAME = 'expense_splits' THEN
    FOR affected_user IN
      SELECT affected.user_id
      FROM (
        SELECT CASE WHEN TG_OP <> 'DELETE' THEN NEW.user_id END AS user_id
        UNION
        SELECT CASE WHEN TG_OP <> 'INSERT' THEN OLD.user_id END
      ) affected
      WHERE affected.user_id IS NOT NULL
      ORDER BY affected.user_id
    LOOP
      PERFORM private.settlement_user_write_lock(affected_user);
    END LOOP;
  ELSIF TG_TABLE_NAME = 'settlement_scope_transfers' THEN
    FOR affected_user IN
      SELECT affected.user_id
      FROM (
        SELECT o.actor_user_id AS user_id
        FROM public.settlement_operations o
        WHERE TG_OP <> 'DELETE' AND o.id = NEW.operation_id
        UNION
        SELECT o.friend_user_id
        FROM public.settlement_operations o
        WHERE TG_OP <> 'DELETE' AND o.id = NEW.operation_id
        UNION
        SELECT o.actor_user_id
        FROM public.settlement_operations o
        WHERE TG_OP <> 'INSERT' AND o.id = OLD.operation_id
        UNION
        SELECT o.friend_user_id
        FROM public.settlement_operations o
        WHERE TG_OP <> 'INSERT' AND o.id = OLD.operation_id
      ) affected
      WHERE affected.user_id IS NOT NULL
      ORDER BY affected.user_id
    LOOP
      PERFORM private.settlement_user_write_lock(affected_user);
    END LOOP;
  ELSIF TG_TABLE_NAME = 'settlements' THEN
    FOR affected_user IN
      SELECT affected.user_id
      FROM (
        SELECT CASE WHEN TG_OP <> 'DELETE' THEN NEW.from_user_id END AS user_id
        UNION
        SELECT CASE WHEN TG_OP <> 'DELETE' THEN NEW.to_user_id END
        UNION
        SELECT CASE WHEN TG_OP <> 'INSERT' THEN OLD.from_user_id END
        UNION
        SELECT CASE WHEN TG_OP <> 'INSERT' THEN OLD.to_user_id END
      ) affected
      WHERE affected.user_id IS NOT NULL
      ORDER BY affected.user_id
    LOOP
      PERFORM private.settlement_user_write_lock(affected_user);
    END LOOP;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS serialize_settlement_balance_write ON public.expenses;
CREATE TRIGGER serialize_settlement_balance_write
BEFORE INSERT OR UPDATE OR DELETE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.serialize_settlement_balance_write();

DROP TRIGGER IF EXISTS serialize_settlement_balance_write ON public.expense_splits;
CREATE TRIGGER serialize_settlement_balance_write
BEFORE INSERT OR UPDATE OR DELETE ON public.expense_splits
FOR EACH ROW EXECUTE FUNCTION public.serialize_settlement_balance_write();

DROP TRIGGER IF EXISTS serialize_settlement_balance_write ON public.group_members;
CREATE TRIGGER serialize_settlement_balance_write
BEFORE INSERT OR UPDATE OR DELETE ON public.group_members
FOR EACH ROW EXECUTE FUNCTION public.serialize_settlement_balance_write();

DROP TRIGGER IF EXISTS serialize_settlement_balance_write ON public.settlement_scope_transfers;
CREATE TRIGGER serialize_settlement_balance_write
BEFORE INSERT OR UPDATE OR DELETE ON public.settlement_scope_transfers
FOR EACH ROW EXECUTE FUNCTION public.serialize_settlement_balance_write();

DROP TRIGGER IF EXISTS serialize_settlement_balance_write ON public.settlements;
CREATE TRIGGER serialize_settlement_balance_write
BEFORE INSERT OR UPDATE OR DELETE ON public.settlements
FOR EACH ROW EXECUTE FUNCTION public.serialize_settlement_balance_write();

REVOKE ALL ON FUNCTION public.serialize_settlement_balance_write() FROM PUBLIC, anon, authenticated, service_role;

-- Shared, server-owned pair scope balance. A NULL group is the direct scope;
-- group scopes include only expenses and cash between the requested pair.
CREATE OR REPLACE FUNCTION private.settlement_pair_scope_balance(
  p_actor_user_id UUID,
  p_friend_user_id UUID,
  p_group_id UUID,
  p_currency TEXT
)
RETURNS NUMERIC
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
  SELECT CASE WHEN p_group_id IS NULL THEN
    COALESCE((SELECT SUM(CASE
      WHEN e.paid_by = p_actor_user_id THEN COALESCE(friend_split.amount, 0)
      WHEN e.paid_by = p_friend_user_id THEN -COALESCE(actor_split.amount, 0)
      ELSE 0 END)
      FROM public.expenses e
      LEFT JOIN public.expense_splits actor_split
        ON actor_split.expense_id = e.id AND actor_split.user_id = p_actor_user_id
      LEFT JOIN public.expense_splits friend_split
        ON friend_split.expense_id = e.id AND friend_split.user_id = p_friend_user_id
      WHERE e.deleted_at IS NULL AND e.group_id IS NULL
        AND e.currency = p_currency AND e.paid_by IN (p_actor_user_id, p_friend_user_id)), 0)
    + COALESCE((SELECT SUM(CASE WHEN s.from_user_id = p_actor_user_id
        THEN s.amount ELSE -s.amount END)
      FROM public.settlements s
      WHERE s.group_id IS NULL AND s.currency = p_currency
        AND ((s.from_user_id = p_actor_user_id AND s.to_user_id = p_friend_user_id)
          OR (s.from_user_id = p_friend_user_id AND s.to_user_id = p_actor_user_id))), 0)
    - COALESCE((SELECT SUM(CASE WHEN t.from_user_id = p_actor_user_id
        THEN t.signed_group_balance_delta ELSE -t.signed_group_balance_delta END)
      FROM public.settlement_scope_transfers t
      JOIN public.settlement_operations o ON o.id = t.operation_id
      WHERE t.currency = p_currency
        AND ((o.actor_user_id = p_actor_user_id AND o.friend_user_id = p_friend_user_id)
          OR (o.actor_user_id = p_friend_user_id AND o.friend_user_id = p_actor_user_id))
        AND NOT EXISTS (
          SELECT 1 FROM public.settlements converted
          JOIN public.settlement_scope_transfers converted_transfer
            ON converted_transfer.id = converted.backfilled_transfer_id
          WHERE converted_transfer.operation_id = t.operation_id
            AND NOT converted_transfer.is_reversal)), 0)
  ELSE
    COALESCE((SELECT SUM(CASE
      WHEN e.paid_by = p_actor_user_id THEN COALESCE(friend_split.amount, 0)
      WHEN e.paid_by = p_friend_user_id THEN -COALESCE(actor_split.amount, 0)
      ELSE 0 END)
      FROM public.expenses e
      JOIN public.group_members actor_member
        ON actor_member.group_id = e.group_id AND actor_member.user_id = p_actor_user_id
      JOIN public.group_members friend_member
        ON friend_member.group_id = e.group_id AND friend_member.user_id = p_friend_user_id
      LEFT JOIN public.expense_splits actor_split
        ON actor_split.expense_id = e.id AND actor_split.user_id = p_actor_user_id
      LEFT JOIN public.expense_splits friend_split
        ON friend_split.expense_id = e.id AND friend_split.user_id = p_friend_user_id
      WHERE e.deleted_at IS NULL AND e.group_id = p_group_id
        AND e.currency = p_currency AND e.paid_by IN (p_actor_user_id, p_friend_user_id)), 0)
    + COALESCE((SELECT SUM(CASE WHEN s.from_user_id = p_friend_user_id
        THEN -s.amount WHEN s.to_user_id = p_friend_user_id
        THEN s.amount ELSE 0 END)
      FROM public.settlements s
      JOIN public.group_members actor_member
        ON actor_member.group_id = s.group_id AND actor_member.user_id = p_actor_user_id
      JOIN public.group_members friend_member
        ON friend_member.group_id = s.group_id AND friend_member.user_id = p_friend_user_id
      WHERE s.group_id = p_group_id AND s.currency = p_currency
        AND ((s.from_user_id = p_actor_user_id AND s.to_user_id = p_friend_user_id)
          OR (s.from_user_id = p_friend_user_id AND s.to_user_id = p_actor_user_id))), 0)
    + COALESCE((SELECT SUM(CASE WHEN t.from_user_id = p_actor_user_id
        THEN t.signed_group_balance_delta ELSE -t.signed_group_balance_delta END)
      FROM public.settlement_scope_transfers t
      JOIN public.settlement_operations o ON o.id = t.operation_id
      WHERE t.group_id = p_group_id AND t.currency = p_currency
        AND ((o.actor_user_id = p_actor_user_id AND o.friend_user_id = p_friend_user_id)
          OR (o.actor_user_id = p_friend_user_id AND o.friend_user_id = p_actor_user_id))
        AND NOT EXISTS (
          SELECT 1 FROM public.settlements converted
          JOIN public.settlement_scope_transfers converted_transfer
            ON converted_transfer.id = converted.backfilled_transfer_id
          WHERE converted_transfer.operation_id = t.operation_id
            AND NOT converted_transfer.is_reversal)), 0)
  END;
$$;

REVOKE ALL ON FUNCTION private.settlement_pair_scope_balance(UUID, UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

-- Existing rows used the actor-relative trigger check. Participant-relative
-- checking is equivalent for actor-originated historical rows and is required
-- for the from-user-oriented cancellation representation in ADR-0003.
CREATE OR REPLACE FUNCTION public.validate_settlement_scope_transfer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  operation_row public.settlement_operations%ROWTYPE;
  actor_balance NUMERIC;
  expected_delta NUMERIC;
BEGIN
  IF NEW.is_reversal THEN RETURN NEW; END IF;

  SELECT * INTO operation_row
  FROM public.settlement_operations WHERE id = NEW.operation_id;
  IF operation_row.id IS NULL THEN RAISE EXCEPTION 'SETTLEMENT_OPERATION_INVALID'; END IF;
  PERFORM private.settlement_pair_write_lock(operation_row.actor_user_id, operation_row.friend_user_id);
  IF NEW.from_user_id NOT IN (operation_row.actor_user_id, operation_row.friend_user_id)
     OR NEW.to_user_id NOT IN (operation_row.actor_user_id, operation_row.friend_user_id)
     OR NEW.from_user_id = NEW.to_user_id THEN
    RAISE EXCEPTION 'SETTLEMENT_TRANSFER_INVALID';
  END IF;

  actor_balance := private.settlement_pair_scope_balance(
    operation_row.actor_user_id, operation_row.friend_user_id,
    NEW.group_id, NEW.currency);
  expected_delta := CASE WHEN NEW.from_user_id = operation_row.actor_user_id
    THEN -actor_balance ELSE actor_balance END;
  IF ROUND(NEW.signed_group_balance_delta, 2) <> ROUND(expected_delta, 2) THEN
    RAISE EXCEPTION 'SETTLEMENT_TRANSFER_BALANCE_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_settlement_scope_transfer
  ON public.settlement_scope_transfers;
CREATE TRIGGER validate_settlement_scope_transfer
BEFORE INSERT ON public.settlement_scope_transfers
FOR EACH ROW EXECUTE FUNCTION public.validate_settlement_scope_transfer();

REVOKE ALL ON FUNCTION public.validate_settlement_scope_transfer()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.commit_settlement_operation(
  p_payment_intent_id UUID, p_friend_id UUID, p_group_id UUID, p_mode TEXT,
  p_amount NUMERIC, p_currency TEXT, p_date TIMESTAMPTZ,
  p_expected_balance NUMERIC, p_allocations JSONB,
  p_transfers JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  app_user_id UUID;
  v_operation_id UUID;
  commitment_id UUID;
  existing_operation public.settlement_operations%ROWTYPE;
  existing_commitment public.settlement_commitments%ROWTYPE;
  operation_reused BOOLEAN := false;
  fingerprint TEXT;
  allocation JSONB;
  transfer JSONB;
  requested_allocations JSONB := '[]'::jsonb;
  requested_transfers JSONB := '[]'::jsonb;
  expected_allocations JSONB := '[]'::jsonb;
  expected_transfers JSONB := '[]'::jsonb;
  group_ids UUID[] := '{}'::UUID[];
  scope_group_id UUID;
  scope_balance NUMERIC;
  direct_balance NUMERIC;
  current_balance NUMERIC;
  current_cents BIGINT;
  expected_cents BIGINT;
  amount_cents BIGINT;
  remaining_cents BIGINT;
  payment_direction INTEGER;
  paid_cents BIGINT;
  residual_cents BIGINT;
  direct_paid_cents BIGINT := 0;
  cancellation_net_cents BIGINT := 0;
  direct_residual_cents BIGINT;
  full_payment BOOLEAN;
  allocation_group_id UUID;
  allocation_from UUID;
  allocation_to UUID;
  allocation_amount NUMERIC;
  allocation_currency TEXT;
  transfer_group_id UUID;
  transfer_from UUID;
  transfer_to UUID;
  transfer_delta NUMERIC;
  transfer_amount NUMERIC;
  transfer_currency TEXT;
  commitment_created_at TIMESTAMPTZ;
  settlement_direction TEXT;
  settlement_rows JSONB;
  transfer_rows JSONB;
  affected_group_ids JSONB;
  scope_row RECORD;
BEGIN
  SELECT u.id INTO app_user_id FROM public.users u
  WHERE u.auth_user_id = (SELECT auth.uid()) LIMIT 1;
  IF app_user_id IS NULL THEN RAISE EXCEPTION 'SETTLEMENT_UNAUTHENTICATED'; END IF;
  PERFORM private.settlement_pair_write_lock(app_user_id, p_friend_id);
  IF p_payment_intent_id IS NULL THEN RAISE EXCEPTION 'SETTLEMENT_PAYMENT_INTENT_REQUIRED'; END IF;
  IF p_friend_id IS NULL OR p_friend_id = app_user_id THEN RAISE EXCEPTION 'SETTLEMENT_FRIENDSHIP_REQUIRED'; END IF;
  IF p_mode NOT IN ('all_balances', 'group') THEN RAISE EXCEPTION 'SETTLEMENT_MODE_INVALID'; END IF;
  IF p_mode = 'all_balances' AND p_group_id IS NOT NULL THEN RAISE EXCEPTION 'SETTLEMENT_GROUP_SCOPE_INVALID'; END IF;
  IF p_mode = 'group' AND p_group_id IS NULL THEN RAISE EXCEPTION 'SETTLEMENT_GROUP_REQUIRED'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount <> ROUND(p_amount, 2) THEN RAISE EXCEPTION 'SETTLEMENT_AMOUNT_INVALID'; END IF;
  IF p_expected_balance IS NULL OR p_expected_balance <> ROUND(p_expected_balance, 2) THEN RAISE EXCEPTION 'SETTLEMENT_STALE_BALANCE'; END IF;
  IF p_currency IS NULL OR BTRIM(p_currency) = '' THEN RAISE EXCEPTION 'SETTLEMENT_CURRENCY_REQUIRED'; END IF;
  IF BTRIM(p_currency) <> 'USD' THEN RAISE EXCEPTION 'SETTLEMENT_CURRENCY_UNSUPPORTED'; END IF;
  IF jsonb_typeof(p_allocations) <> 'array' OR jsonb_array_length(p_allocations) = 0 THEN RAISE EXCEPTION 'SETTLEMENT_ALLOCATIONS_REQUIRED'; END IF;
  IF jsonb_typeof(COALESCE(p_transfers, '[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'SETTLEMENT_TRANSFERS_INVALID'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.friendships f WHERE f.status = 'accepted'
    AND ((f.user_id = app_user_id AND f.friend_id = p_friend_id)
      OR (f.user_id = p_friend_id AND f.friend_id = app_user_id)))
  THEN RAISE EXCEPTION 'SETTLEMENT_FRIENDSHIP_REQUIRED'; END IF;
  IF p_mode = 'group' AND NOT EXISTS (
    SELECT 1 FROM public.group_members a JOIN public.group_members b
      ON b.group_id = a.group_id AND b.user_id = p_friend_id
    WHERE a.group_id = p_group_id AND a.user_id = app_user_id)
  THEN RAISE EXCEPTION 'SETTLEMENT_GROUP_SCOPE_INVALID'; END IF;

  amount_cents := ROUND(p_amount * 100)::BIGINT;
  expected_cents := ROUND(p_expected_balance * 100)::BIGINT;
  fingerprint := md5(jsonb_build_object(
    'friendId', p_friend_id, 'groupId', p_group_id, 'mode', p_mode,
    'amount', p_amount, 'currency', p_currency, 'date', p_date,
    'expectedBalance', p_expected_balance, 'allocations', p_allocations,
    'transfers', COALESCE(p_transfers, '[]'::jsonb))::TEXT);

  -- Idempotency is checked before any recomputation. The unique-key insert
  -- waits for a concurrent winner, then the locked row is the receipt source.
  INSERT INTO public.settlement_operations (
    actor_user_id, friend_user_id, group_id, mode, currency,
    expected_balance, requested_payment_amount, payment_intent_id,
    request_fingerprint)
  VALUES (app_user_id, p_friend_id, p_group_id, p_mode, p_currency,
    p_expected_balance, p_amount, p_payment_intent_id, fingerprint)
  ON CONFLICT (actor_user_id, payment_intent_id) DO NOTHING
  RETURNING id INTO v_operation_id;

  IF v_operation_id IS NULL THEN
    SELECT * INTO existing_operation FROM public.settlement_operations
    WHERE actor_user_id = app_user_id AND payment_intent_id = p_payment_intent_id
    FOR UPDATE;
    IF existing_operation.id IS NULL THEN RAISE EXCEPTION 'SETTLEMENT_OPERATION_INVALID'; END IF;
    IF existing_operation.friend_user_id <> p_friend_id
       OR existing_operation.group_id IS DISTINCT FROM p_group_id
       OR existing_operation.mode <> p_mode
       OR existing_operation.currency <> p_currency
       OR existing_operation.requested_payment_amount <> p_amount
       OR existing_operation.expected_balance <> p_expected_balance
       OR (existing_operation.request_fingerprint IS NOT NULL
           AND existing_operation.request_fingerprint <> fingerprint)
    THEN RAISE EXCEPTION 'SETTLEMENT_PAYMENT_INTENT_REUSED_WITH_DIFFERENT_PAYMENT'; END IF;
    v_operation_id := existing_operation.id;
    operation_reused := true;
  ELSE
    -- Lock the pair in deterministic UUID order before reading any scope.
    PERFORM 1 FROM public.users u
    WHERE u.id IN (app_user_id, p_friend_id) ORDER BY u.id FOR UPDATE;

    IF p_mode = 'all_balances' THEN
      SELECT COALESCE(array_agg(group_id ORDER BY group_id), '{}'::UUID[])
      INTO group_ids FROM (
        SELECT DISTINCT e.group_id AS group_id
        FROM public.expenses e
        JOIN public.group_members a ON a.group_id = e.group_id AND a.user_id = app_user_id
        JOIN public.group_members b ON b.group_id = e.group_id AND b.user_id = p_friend_id
        WHERE e.group_id IS NOT NULL AND e.deleted_at IS NULL AND e.currency = p_currency
          AND e.paid_by IN (app_user_id, p_friend_id)
        UNION SELECT DISTINCT s.group_id
        FROM public.settlements s
        JOIN public.group_members a ON a.group_id = s.group_id AND a.user_id = app_user_id
        JOIN public.group_members b ON b.group_id = s.group_id AND b.user_id = p_friend_id
        WHERE s.group_id IS NOT NULL AND s.currency = p_currency
          AND ((s.from_user_id = app_user_id AND s.to_user_id = p_friend_id)
            OR (s.from_user_id = p_friend_id AND s.to_user_id = app_user_id))
        UNION SELECT DISTINCT t.group_id
        FROM public.settlement_scope_transfers t
        JOIN public.settlement_operations o ON o.id = t.operation_id
        JOIN public.group_members a ON a.group_id = t.group_id AND a.user_id = app_user_id
        JOIN public.group_members b ON b.group_id = t.group_id AND b.user_id = p_friend_id
        WHERE t.currency = p_currency AND NOT t.is_reversal
          AND ((o.actor_user_id = app_user_id AND o.friend_user_id = p_friend_id)
            OR (o.actor_user_id = p_friend_id AND o.friend_user_id = app_user_id))
          AND NOT EXISTS (SELECT 1 FROM public.settlements converted
            JOIN public.settlement_scope_transfers ct ON ct.id = converted.backfilled_transfer_id
            WHERE ct.operation_id = t.operation_id AND NOT ct.is_reversal)
      ) groups;
    ELSE
      group_ids := ARRAY[p_group_id];
    END IF;

    direct_balance := private.settlement_pair_scope_balance(app_user_id, p_friend_id, NULL, p_currency);
    current_balance := CASE WHEN p_mode = 'group' THEN
      private.settlement_pair_scope_balance(app_user_id, p_friend_id, p_group_id, p_currency)
      ELSE direct_balance + COALESCE((SELECT SUM(private.settlement_pair_scope_balance(
        app_user_id, p_friend_id, g, p_currency)) FROM unnest(group_ids) AS ids(g)), 0) END;
    current_cents := ROUND(current_balance * 100)::BIGINT;
    IF current_cents <> expected_cents THEN RAISE EXCEPTION 'SETTLEMENT_STALE_BALANCE'; END IF;
    IF current_cents = 0 OR amount_cents > ABS(current_cents) THEN
      RAISE EXCEPTION 'SETTLEMENT_ALLOCATION_OVER_BALANCE';
    END IF;
    payment_direction := CASE WHEN current_cents > 0 THEN 1 ELSE -1 END;
    full_payment := p_mode = 'all_balances' AND amount_cents = ABS(current_cents);
    IF NOT full_payment AND jsonb_array_length(COALESCE(p_transfers, '[]'::jsonb)) > 0 THEN
      RAISE EXCEPTION 'SETTLEMENT_TRANSFERS_NOT_ALLOWED';
    END IF;

    -- Direct first, then smallest same-direction group, with UUID tie-break.
    remaining_cents := amount_cents;
    scope_balance := direct_balance;
    IF p_mode = 'all_balances' AND scope_balance <> 0
       AND SIGN(ROUND(scope_balance * 100)::BIGINT) = payment_direction THEN
      paid_cents := LEAST(ABS(ROUND(scope_balance * 100)::BIGINT), remaining_cents);
      direct_paid_cents := paid_cents;
      expected_allocations := expected_allocations || jsonb_build_array(jsonb_build_object(
        'groupId', NULL, 'fromUserId', CASE WHEN payment_direction < 0 THEN app_user_id ELSE p_friend_id END,
        'toUserId', CASE WHEN payment_direction < 0 THEN p_friend_id ELSE app_user_id END,
        'amount', paid_cents::NUMERIC / 100, 'currency', p_currency));
      remaining_cents := remaining_cents - paid_cents;
    END IF;
    FOR scope_row IN
      SELECT g AS group_id, private.settlement_pair_scope_balance(app_user_id, p_friend_id, g, p_currency) AS balance
      FROM unnest(group_ids) AS ids(g)
      WHERE private.settlement_pair_scope_balance(app_user_id, p_friend_id, g, p_currency) <> 0
      ORDER BY ABS(private.settlement_pair_scope_balance(app_user_id, p_friend_id, g, p_currency) * 100), g
    LOOP
      EXIT WHEN remaining_cents = 0;
      IF SIGN(ROUND(scope_row.balance * 100)::BIGINT) = payment_direction THEN
        paid_cents := LEAST(ABS(ROUND(scope_row.balance * 100)::BIGINT), remaining_cents);
        expected_allocations := expected_allocations || jsonb_build_array(jsonb_build_object(
          'groupId', scope_row.group_id, 'fromUserId', CASE WHEN payment_direction < 0 THEN app_user_id ELSE p_friend_id END,
          'toUserId', CASE WHEN payment_direction < 0 THEN p_friend_id ELSE app_user_id END,
          'amount', paid_cents::NUMERIC / 100, 'currency', p_currency));
        remaining_cents := remaining_cents - paid_cents;
      END IF;
    END LOOP;
    IF remaining_cents <> 0 THEN RAISE EXCEPTION 'SETTLEMENT_ALLOCATION_INVALID'; END IF;

    IF full_payment THEN
      FOR scope_row IN
        SELECT g AS group_id, private.settlement_pair_scope_balance(app_user_id, p_friend_id, g, p_currency) AS balance
        FROM unnest(group_ids) AS ids(g)
        WHERE private.settlement_pair_scope_balance(app_user_id, p_friend_id, g, p_currency) <> 0
        ORDER BY ABS(private.settlement_pair_scope_balance(app_user_id, p_friend_id, g, p_currency) * 100), g
      LOOP
        scope_group_id := scope_row.group_id;
        scope_balance := scope_row.balance;
        paid_cents := COALESCE((SELECT SUM((item->>'amount')::NUMERIC * 100)::BIGINT
          FROM jsonb_array_elements(expected_allocations) item
          WHERE NULLIF(item->>'groupId', '')::UUID = scope_group_id), 0);
        residual_cents := ROUND(scope_balance * 100)::BIGINT - payment_direction * paid_cents;
        IF residual_cents <> 0 THEN
          cancellation_net_cents := cancellation_net_cents + residual_cents;
          -- Ticket 17 (option B): cancellation legs are transfer-free
          -- non-cash effects in the ticket-09 from-user orientation. The
          -- creditor holding the positive balance originates the leg and the
          -- delta is the negative of that balance (dev-proven -15.50 shape),
          -- never the absolute value, so the planner, trigger, and every
          -- participant-based reader agree.
          expected_transfers := expected_transfers || jsonb_build_array(jsonb_build_object(
            'groupId', scope_group_id,
            'fromUserId', CASE WHEN residual_cents > 0 THEN app_user_id ELSE p_friend_id END,
            'toUserId', CASE WHEN residual_cents > 0 THEN p_friend_id ELSE app_user_id END,
            'amount', ABS(residual_cents)::NUMERIC / 100,
            'currency', p_currency,
            'signedGroupBalanceDelta', (-ABS(residual_cents))::NUMERIC / 100));
        END IF;
      END LOOP;
      direct_residual_cents := ROUND(direct_balance * 100)::BIGINT
        - payment_direction * direct_paid_cents;
      IF direct_residual_cents + cancellation_net_cents <> 0 THEN
        RAISE EXCEPTION 'SETTLEMENT_TRANSFER_INVALID';
      END IF;
    END IF;

    -- Normalize only the contract fields. Unknown fields and duplicate
    -- scopes cannot alter the server-owned plan because the normalized arrays
    -- must equal the recomputed arrays exactly.
    FOR allocation IN SELECT value FROM jsonb_array_elements(p_allocations) LOOP
      IF jsonb_typeof(allocation) <> 'object' OR EXISTS (
        SELECT 1 FROM jsonb_object_keys(allocation) key
        WHERE key NOT IN ('groupId', 'fromUserId', 'toUserId', 'amount', 'currency'))
      THEN RAISE EXCEPTION 'SETTLEMENT_ALLOCATION_INVALID'; END IF;
      allocation_group_id := NULLIF(allocation->>'groupId', '')::UUID;
      allocation_from := NULLIF(allocation->>'fromUserId', '')::UUID;
      allocation_to := NULLIF(allocation->>'toUserId', '')::UUID;
      allocation_amount := (allocation->>'amount')::NUMERIC;
      allocation_currency := allocation->>'currency';
      IF allocation_from IS NULL OR allocation_to IS NULL OR allocation_from = allocation_to
         OR allocation_from NOT IN (app_user_id, p_friend_id) OR allocation_to NOT IN (app_user_id, p_friend_id)
         OR allocation_amount IS NULL OR allocation_amount <= 0 OR allocation_amount <> ROUND(allocation_amount, 2)
         OR allocation_currency <> p_currency THEN RAISE EXCEPTION 'SETTLEMENT_ALLOCATION_INVALID'; END IF;
      IF p_mode = 'group' AND allocation_group_id IS DISTINCT FROM p_group_id THEN RAISE EXCEPTION 'SETTLEMENT_GROUP_SCOPE_INVALID'; END IF;
      IF allocation_group_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.group_members a JOIN public.group_members b
          ON b.group_id = a.group_id AND b.user_id = p_friend_id
        WHERE a.group_id = allocation_group_id AND a.user_id = app_user_id)
      THEN RAISE EXCEPTION 'SETTLEMENT_GROUP_SCOPE_INVALID'; END IF;
      requested_allocations := requested_allocations || jsonb_build_array(jsonb_build_object(
        'groupId', allocation_group_id, 'fromUserId', allocation_from, 'toUserId', allocation_to,
        'amount', allocation_amount, 'currency', allocation_currency));
    END LOOP;
    IF requested_allocations <> expected_allocations THEN RAISE EXCEPTION 'SETTLEMENT_ALLOCATION_INVALID'; END IF;

    FOR transfer IN SELECT value FROM jsonb_array_elements(COALESCE(p_transfers, '[]'::jsonb)) LOOP
      IF jsonb_typeof(transfer) <> 'object' OR EXISTS (
        SELECT 1 FROM jsonb_object_keys(transfer) key
        WHERE key NOT IN ('groupId', 'fromUserId', 'toUserId', 'amount', 'currency', 'signedGroupBalanceDelta'))
      THEN RAISE EXCEPTION 'SETTLEMENT_TRANSFER_INVALID'; END IF;
      transfer_group_id := NULLIF(transfer->>'groupId', '')::UUID;
      transfer_from := NULLIF(transfer->>'fromUserId', '')::UUID;
      transfer_to := NULLIF(transfer->>'toUserId', '')::UUID;
      transfer_currency := transfer->>'currency';
      transfer_delta := (transfer->>'signedGroupBalanceDelta')::NUMERIC;
      transfer_amount := NULLIF(transfer->>'amount', '')::NUMERIC;
      IF transfer_group_id IS NULL OR transfer_from IS NULL OR transfer_to IS NULL
         OR transfer_from = transfer_to OR transfer_from NOT IN (app_user_id, p_friend_id)
         OR transfer_to NOT IN (app_user_id, p_friend_id) OR transfer_currency <> p_currency
         -- Ticket 17 (option B): cancellation deltas are strictly negative
         -- from-user-oriented values; absolute/positive deltas inflate under
         -- participant-based readers and are rejected.
         OR transfer_delta IS NULL OR transfer_delta >= 0 OR transfer_delta <> ROUND(transfer_delta, 2)
         OR (transfer_amount IS NOT NULL AND (transfer_amount <> ABS(transfer_delta) OR transfer_amount <> ROUND(transfer_amount, 2)))
      THEN RAISE EXCEPTION 'SETTLEMENT_TRANSFER_INVALID'; END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.group_members a JOIN public.group_members b
          ON b.group_id = a.group_id AND b.user_id = p_friend_id
        WHERE a.group_id = transfer_group_id AND a.user_id = app_user_id)
      THEN RAISE EXCEPTION 'SETTLEMENT_GROUP_SCOPE_INVALID'; END IF;
      requested_transfers := requested_transfers || jsonb_build_array(jsonb_build_object(
        'groupId', transfer_group_id, 'fromUserId', transfer_from, 'toUserId', transfer_to,
        'amount', ABS(transfer_delta), 'currency', transfer_currency,
        'signedGroupBalanceDelta', transfer_delta));
    END LOOP;
    IF requested_transfers <> expected_transfers THEN RAISE EXCEPTION 'SETTLEMENT_TRANSFER_INVALID'; END IF;

    -- Re-read immediately before the first write. Expense and settlement
    -- writers do not share this function's user-row lock, so this closes the
    -- validation window for any committed balance mutation observed before
    -- the atomic inserts begin.
    direct_balance := private.settlement_pair_scope_balance(app_user_id, p_friend_id, NULL, p_currency);
    current_balance := CASE WHEN p_mode = 'group' THEN
      private.settlement_pair_scope_balance(app_user_id, p_friend_id, p_group_id, p_currency)
      ELSE direct_balance + COALESCE((SELECT SUM(private.settlement_pair_scope_balance(
        app_user_id, p_friend_id, g, p_currency)) FROM unnest(group_ids) AS ids(g)), 0) END;
    IF ROUND(current_balance * 100)::BIGINT <> expected_cents THEN
      RAISE EXCEPTION 'SETTLEMENT_STALE_BALANCE';
    END IF;

    INSERT INTO public.settlement_commitments (payment_intent_id, actor_user_id, friend_user_id, amount, currency, date)
    VALUES (p_payment_intent_id, app_user_id, p_friend_id, p_amount, p_currency, p_date)
    RETURNING id INTO commitment_id;
    FOR allocation IN SELECT value FROM jsonb_array_elements(expected_allocations) LOOP
      INSERT INTO public.settlements (group_id, from_user_id, to_user_id, amount, currency, date, commitment_id, operation_id)
      VALUES (NULLIF(allocation->>'groupId', '')::UUID, (allocation->>'fromUserId')::UUID,
        (allocation->>'toUserId')::UUID, (allocation->>'amount')::NUMERIC,
        allocation->>'currency', p_date, commitment_id, v_operation_id);
    END LOOP;
    FOR transfer IN SELECT value FROM jsonb_array_elements(expected_transfers) LOOP
      INSERT INTO public.settlement_scope_transfers (operation_id, group_id, from_user_id, to_user_id,
        currency, signed_group_balance_delta, note)
      VALUES (v_operation_id, (transfer->>'groupId')::UUID, (transfer->>'fromUserId')::UUID,
        (transfer->>'toUserId')::UUID, transfer->>'currency',
        (transfer->>'signedGroupBalanceDelta')::NUMERIC, 'Full friend settlement balance cancellation');
    END LOOP;
  END IF;

  SELECT * INTO existing_commitment FROM public.settlement_commitments
  WHERE actor_user_id = app_user_id AND payment_intent_id = p_payment_intent_id FOR UPDATE;
  IF existing_commitment.id IS NULL THEN RAISE EXCEPTION 'SETTLEMENT_OPERATION_INVALID'; END IF;
  commitment_id := existing_commitment.id;
  SELECT existing_commitment.created_at INTO commitment_created_at;
  SELECT CASE WHEN s.from_user_id = app_user_id THEN 'you_paid_friend' ELSE 'friend_paid_you' END
    INTO settlement_direction FROM public.settlements s
    WHERE s.operation_id = v_operation_id ORDER BY s.created_at, s.id LIMIT 1;
  IF settlement_direction IS NULL THEN settlement_direction := CASE WHEN p_expected_balance < 0
    THEN 'you_paid_friend' ELSE 'friend_paid_you' END; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', s.id, 'operationId', s.operation_id,
    'groupId', s.group_id, 'fromUserId', s.from_user_id, 'toUserId', s.to_user_id,
    'amount', s.amount, 'currency', s.currency, 'date', s.date, 'notes', s.notes,
    'createdAt', s.created_at) ORDER BY s.created_at, s.id), '[]'::jsonb)
    INTO settlement_rows FROM public.settlements s WHERE s.operation_id = v_operation_id;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', t.id, 'operationId', t.operation_id,
    'groupId', t.group_id, 'fromUserId', t.from_user_id, 'toUserId', t.to_user_id,
    'currency', t.currency, 'signedGroupBalanceDelta', t.signed_group_balance_delta,
    'note', t.note, 'createdAt', t.created_at) ORDER BY t.created_at, t.id), '[]'::jsonb)
    INTO transfer_rows FROM public.settlement_scope_transfers t
    WHERE t.operation_id = v_operation_id AND NOT t.is_reversal;
  SELECT COALESCE(jsonb_agg(group_id ORDER BY group_id), '[]'::jsonb) INTO affected_group_ids
  FROM (SELECT DISTINCT s.group_id FROM public.settlements s WHERE s.operation_id = v_operation_id AND s.group_id IS NOT NULL
    UNION SELECT DISTINCT t.group_id FROM public.settlement_scope_transfers t WHERE t.operation_id = v_operation_id AND NOT t.is_reversal) groups;
  RETURN jsonb_build_object('paymentIntentId', p_payment_intent_id, 'reused', operation_reused,
    'committedAt', commitment_created_at, 'totalAmount', existing_commitment.amount,
    'currency', existing_commitment.currency, 'direction', settlement_direction,
    'settlements', settlement_rows, 'operationId', v_operation_id, 'mode', p_mode,
    'affectedGroupIds', affected_group_ids, 'transfers', transfer_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.commit_settlement_operation(
  UUID, UUID, UUID, TEXT, NUMERIC, TEXT, TIMESTAMPTZ, NUMERIC, JSONB, JSONB)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.commit_settlement_operation(
  UUID, UUID, UUID, TEXT, NUMERIC, TEXT, TIMESTAMPTZ, NUMERIC, JSONB, JSONB)
  TO authenticated;

-- Reversal reads and writes the same balance sources, so it joins the shared
-- writer lock before its stale check rather than waiting only at INSERT.
CREATE OR REPLACE FUNCTION public.reverse_settlement_operation(
  p_operation_id UUID,
  p_expected_balance NUMERIC
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
  actor_current_balance NUMERIC;
  caller_current_balance NUMERIC;
  actor_expected_after NUMERIC;
  caller_expected_after NUMERIC;
  cash_effect_actor NUMERIC := 0;
  cash_has_rows BOOLEAN := FALSE;
  is_actor BOOLEAN := FALSE;
BEGIN
  SELECT u.id INTO app_user_id FROM public.users u
  WHERE u.auth_user_id = (SELECT auth.uid()) LIMIT 1;
  IF app_user_id IS NULL THEN RAISE EXCEPTION 'SETTLEMENT_UNAUTHENTICATED'; END IF;

  SELECT * INTO operation_row FROM public.settlement_operations
  WHERE id = p_operation_id FOR UPDATE;
  IF operation_row.id IS NULL THEN RAISE EXCEPTION 'SETTLEMENT_OPERATION_NOT_FOUND'; END IF;
  IF app_user_id <> operation_row.actor_user_id
     AND app_user_id <> operation_row.friend_user_id THEN
    RAISE EXCEPTION 'SETTLEMENT_REVERSAL_UNAUTHORIZED';
  END IF;
  PERFORM private.settlement_pair_write_lock(operation_row.actor_user_id, operation_row.friend_user_id);
  IF operation_row.status = 'reversed' THEN
    SELECT * INTO reversal_row FROM public.settlement_operation_reversals
    WHERE operation_id = operation_row.id;
    RETURN jsonb_build_object('operationId', operation_row.id, 'status', 'reversed',
      'reversedAt', reversal_row.created_at, 'reused', true);
  END IF;
  IF operation_row.status <> 'committed' THEN
    RAISE EXCEPTION 'SETTLEMENT_OPERATION_INVALID_STATUS';
  END IF;
  IF p_expected_balance IS NULL OR p_expected_balance <> ROUND(p_expected_balance, 2) THEN
    RAISE EXCEPTION 'SETTLEMENT_STALE_BALANCE';
  END IF;
  is_actor := (app_user_id = operation_row.actor_user_id);

  SELECT COUNT(*) > 0,
    COALESCE(SUM(CASE WHEN s.from_user_id = operation_row.actor_user_id
      THEN s.amount ELSE -s.amount END), 0)
  INTO cash_has_rows, cash_effect_actor
  FROM public.settlements s
  WHERE s.operation_id = operation_row.id
    AND (s.notes IS NULL OR s.notes NOT LIKE 'Reversal of settlement operation %');
  IF NOT cash_has_rows OR operation_row.requested_payment_amount IS NULL
     OR operation_row.requested_payment_amount = 0 OR cash_effect_actor = 0 THEN
    actor_expected_after := operation_row.expected_balance;
  ELSIF cash_effect_actor > 0 THEN
    actor_expected_after := operation_row.expected_balance + operation_row.requested_payment_amount;
  ELSE
    actor_expected_after := operation_row.expected_balance - operation_row.requested_payment_amount;
  END IF;
  caller_expected_after := CASE WHEN is_actor THEN actor_expected_after ELSE -actor_expected_after END;
  IF ROUND(p_expected_balance, 2) <> ROUND(caller_expected_after, 2) THEN
    RAISE EXCEPTION 'SETTLEMENT_STALE_BALANCE';
  END IF;

  SELECT COALESCE((SELECT SUM(CASE
    WHEN e.paid_by = operation_row.actor_user_id THEN COALESCE(friend_split.amount, 0)
    WHEN e.paid_by = operation_row.friend_user_id THEN -COALESCE(current_split.amount, 0)
    ELSE 0 END)
    FROM public.expenses e
    LEFT JOIN public.expense_splits current_split ON current_split.expense_id = e.id
      AND current_split.user_id = operation_row.actor_user_id
      AND (current_split.amount > 0 OR e.paid_by = operation_row.actor_user_id)
    LEFT JOIN public.expense_splits friend_split ON friend_split.expense_id = e.id
      AND friend_split.user_id = operation_row.friend_user_id
      AND (friend_split.amount > 0 OR e.paid_by = operation_row.friend_user_id)
    WHERE e.deleted_at IS NULL AND e.group_id IS NULL AND e.currency = operation_row.currency
      AND (COALESCE(current_split.amount, 0) > 0 OR e.paid_by = operation_row.actor_user_id)
      AND (COALESCE(friend_split.amount, 0) > 0 OR e.paid_by = operation_row.friend_user_id)), 0)
  + COALESCE((SELECT SUM(CASE WHEN s.from_user_id = operation_row.actor_user_id
      THEN s.amount ELSE -s.amount END) FROM public.settlements s
    WHERE s.group_id IS NULL AND s.currency = operation_row.currency
      AND ((s.from_user_id = operation_row.actor_user_id AND s.to_user_id = operation_row.friend_user_id)
        OR (s.from_user_id = operation_row.friend_user_id AND s.to_user_id = operation_row.actor_user_id))), 0)
  + COALESCE((SELECT SUM(CASE
      WHEN e.paid_by = operation_row.actor_user_id THEN COALESCE(friend_split.amount, 0)
      WHEN e.paid_by = operation_row.friend_user_id THEN -COALESCE(current_split.amount, 0)
      ELSE 0 END)
    FROM public.expenses e
    JOIN public.group_members actor_member ON actor_member.group_id = e.group_id
      AND actor_member.user_id = operation_row.actor_user_id
    JOIN public.group_members friend_member ON friend_member.group_id = e.group_id
      AND friend_member.user_id = operation_row.friend_user_id
    LEFT JOIN public.expense_splits friend_split ON friend_split.expense_id = e.id
      AND friend_split.user_id = operation_row.friend_user_id
    LEFT JOIN public.expense_splits current_split ON current_split.expense_id = e.id
      AND current_split.user_id = operation_row.actor_user_id
    WHERE e.deleted_at IS NULL AND e.currency = operation_row.currency
      AND e.paid_by IN (operation_row.actor_user_id, operation_row.friend_user_id)), 0)
  + COALESCE((SELECT SUM(CASE WHEN s.from_user_id = operation_row.friend_user_id THEN -s.amount
      WHEN s.to_user_id = operation_row.friend_user_id THEN s.amount ELSE 0 END)
    FROM public.settlements s
    JOIN public.group_members actor_member ON actor_member.group_id = s.group_id
      AND actor_member.user_id = operation_row.actor_user_id
    JOIN public.group_members friend_member ON friend_member.group_id = s.group_id
      AND friend_member.user_id = operation_row.friend_user_id
    WHERE s.currency = operation_row.currency
      AND ((s.from_user_id = operation_row.actor_user_id AND s.to_user_id = operation_row.friend_user_id)
        OR (s.from_user_id = operation_row.friend_user_id AND s.to_user_id = operation_row.actor_user_id))), 0)
  INTO actor_current_balance;
  caller_current_balance := CASE WHEN is_actor THEN actor_current_balance ELSE -actor_current_balance END;
  IF ROUND(caller_current_balance, 2) <> ROUND(p_expected_balance, 2) THEN
    RAISE EXCEPTION 'SETTLEMENT_STALE_BALANCE';
  END IF;

  INSERT INTO public.settlement_operation_reversals (operation_id, actor_user_id)
  VALUES (operation_row.id, app_user_id) RETURNING * INTO reversal_row;
  INSERT INTO public.settlements (group_id, from_user_id, to_user_id, amount, currency,
    date, notes, operation_id)
  SELECT s.group_id, s.to_user_id, s.from_user_id, s.amount, s.currency, NOW(),
    'Reversal of settlement operation ' || operation_row.id, s.operation_id
  FROM public.settlements s WHERE s.operation_id = operation_row.id;
  GET DIAGNOSTICS reversal_settlement_count = ROW_COUNT;
  INSERT INTO public.settlement_scope_transfers (operation_id, group_id, from_user_id,
    to_user_id, currency, signed_group_balance_delta, note, is_reversal)
  SELECT t.operation_id, t.group_id, t.to_user_id, t.from_user_id, t.currency,
    t.signed_group_balance_delta, 'Reversal of settlement operation ' || operation_row.id, true
  FROM public.settlement_scope_transfers t
  WHERE t.operation_id = operation_row.id AND t.is_reversal = false;
  UPDATE public.settlement_operations SET status = 'reversed', reversed_at = reversal_row.created_at
  WHERE id = operation_row.id;
  RETURN jsonb_build_object('operationId', operation_row.id, 'status', 'reversed',
    'reversedAt', reversal_row.created_at, 'reused', false,
    'reversalSettlementCount', reversal_settlement_count);
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_settlement_operation(UUID, NUMERIC) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.reverse_settlement_operation(UUID, NUMERIC) TO authenticated;
