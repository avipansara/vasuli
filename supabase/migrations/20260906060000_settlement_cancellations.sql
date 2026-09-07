-- Dedicated balance-cancellation surface (task 1): standalone
-- settlement_cancellations table plus table-level plumbing.
--
-- This migration is additive. Existing operation, payment, transfer, and
-- settlement rows are retained. Direct client access is denied (RLS enabled,
-- no policies, table revoked); reads and writes go through SECURITY DEFINER
-- RPCs introduced in later tasks. Cancellation rows join the shared
-- transaction-scoped balance-writer serialization via the parent operation's
-- actor and friend, mirroring settlement_scope_transfers.

CREATE TABLE IF NOT EXISTS public.settlement_cancellations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id UUID NOT NULL REFERENCES public.settlement_operations(id) ON DELETE RESTRICT,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE RESTRICT,
  amount NUMERIC NOT NULL CHECK (amount > 0 AND amount = ROUND(amount, 2)),
  -- Immutable effect on the parent operation actor's group balance.  This is
  -- captured from the settled snapshot; readers must never recompute it from
  -- the balance that exists after later expenses.
  signed_group_balance_delta NUMERIC NOT NULL CHECK (
    signed_group_balance_delta <> 0
    AND signed_group_balance_delta = ROUND(signed_group_balance_delta, 2)
  ),
  currency TEXT NOT NULL DEFAULT 'USD',
  note TEXT,
  is_reversal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS settlement_cancellations_operation_id_idx
  ON public.settlement_cancellations (operation_id);
CREATE INDEX IF NOT EXISTS settlement_cancellations_group_id_idx
  ON public.settlement_cancellations (group_id);

ALTER TABLE public.settlement_cancellations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.settlement_cancellations FROM PUBLIC, anon, authenticated;

-- Allow remote clients to invalidate balance projections when a cancellation
-- is committed in another device session.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'settlement_cancellations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.settlement_cancellations;
  END IF;
END;
$$;

-- Cancellation writes affect the same pair scopes as scope transfers, so they
-- join the shared writer lock keyed off the parent operation's actor/friend.
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
  ELSIF TG_TABLE_NAME = 'settlement_cancellations' THEN
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

DROP TRIGGER IF EXISTS serialize_settlement_balance_write ON public.settlement_cancellations;
CREATE TRIGGER serialize_settlement_balance_write
BEFORE INSERT OR UPDATE OR DELETE ON public.settlement_cancellations
FOR EACH ROW EXECUTE FUNCTION public.serialize_settlement_balance_write();

REVOKE ALL ON FUNCTION public.serialize_settlement_balance_write() FROM PUBLIC, anon, authenticated, service_role;

-- Dedicated balance-cancellation surface (task 2): commit path writes and
-- validates cancellations.
--
-- The commit RPC gains `p_cancellations` carrying plain `{groupId, amount,
-- currency}` entries. `p_transfers` stays accepted so existing call shapes
-- keep resolving, but any non-empty value is rejected with
-- `SETTLEMENT_TRANSFERS_FROZEN`: no new scope-transfer row can be written
-- through this boundary. The expected cancellation set is recomputed
-- server-side with the planner ordering (absolute cents ascending, then group
-- UUID): one entry per nonzero group residual. Cancellations remain
-- full-payment-only: a non-empty set on a partial plan raises
-- `SETTLEMENT_TRANSFERS_NOT_ALLOWED`. Submitted entries are normalized to
-- exactly `{groupId, amount, currency}` and must equal the recomputed set,
-- else `SETTLEMENT_TRANSFER_INVALID`. Rows land in
-- `public.settlement_cancellations` with note
-- `Full friend settlement balance cancellation`; the receipt carries a
-- `cancellations` array next to the legacy `transfers` array. Signature,
-- auth, advisory-lock discipline, idempotency, and stale checks are otherwise
-- identical to `20260906040000`.
CREATE OR REPLACE FUNCTION public.commit_settlement_operation(
  p_payment_intent_id UUID, p_friend_id UUID, p_group_id UUID, p_mode TEXT,
  p_amount NUMERIC, p_currency TEXT, p_date TIMESTAMPTZ,
  p_expected_balance NUMERIC, p_allocations JSONB,
  p_transfers JSONB DEFAULT '[]'::jsonb,
  p_cancellations JSONB DEFAULT '[]'::jsonb
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
  cancellation JSONB;
  requested_allocations JSONB := '[]'::jsonb;
  requested_cancellations JSONB := '[]'::jsonb;
  expected_allocations JSONB := '[]'::jsonb;
  expected_cancellations JSONB := '[]'::jsonb;
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
  cancellation_group_id UUID;
  cancellation_amount NUMERIC;
  cancellation_currency TEXT;
  commitment_created_at TIMESTAMPTZ;
  settlement_direction TEXT;
  settlement_rows JSONB;
  transfer_rows JSONB;
  cancellation_rows JSONB;
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
  IF jsonb_typeof(COALESCE(p_cancellations, '[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'SETTLEMENT_TRANSFER_INVALID'; END IF;
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
    'transfers', COALESCE(p_transfers, '[]'::jsonb),
    'cancellations', COALESCE(p_cancellations, '[]'::jsonb))::TEXT);

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
        UNION SELECT DISTINCT c.group_id
        FROM public.settlement_cancellations c
        JOIN public.settlement_operations o ON o.id = c.operation_id
        JOIN public.group_members a ON a.group_id = c.group_id AND a.user_id = app_user_id
        JOIN public.group_members b ON b.group_id = c.group_id AND b.user_id = p_friend_id
        WHERE c.currency = p_currency AND NOT c.is_reversal
          AND ((o.actor_user_id = app_user_id AND o.friend_user_id = p_friend_id)
            OR (o.actor_user_id = p_friend_id AND o.friend_user_id = app_user_id))
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
    -- The scope-transfer table is frozen for new writes: any transfer payload
    -- through this boundary is rejected, including on full payments.
    IF jsonb_array_length(COALESCE(p_transfers, '[]'::jsonb)) > 0 THEN
      RAISE EXCEPTION 'SETTLEMENT_TRANSFERS_FROZEN';
    END IF;
    IF NOT full_payment AND jsonb_array_length(COALESCE(p_cancellations, '[]'::jsonb)) > 0 THEN
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
          -- Dedicated surface: a cancellation names the cleared scope and
          -- amount only in the request; the commit stores the signed effect
          -- captured from the settled snapshot.
          expected_cancellations := expected_cancellations || jsonb_build_array(jsonb_build_object(
            'groupId', scope_group_id,
            'amount', ABS(residual_cents)::NUMERIC / 100,
            'currency', p_currency));
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

    FOR cancellation IN SELECT value FROM jsonb_array_elements(COALESCE(p_cancellations, '[]'::jsonb)) LOOP
      IF jsonb_typeof(cancellation) <> 'object' OR EXISTS (
        SELECT 1 FROM jsonb_object_keys(cancellation) key
        WHERE key NOT IN ('groupId', 'amount', 'currency'))
      THEN RAISE EXCEPTION 'SETTLEMENT_TRANSFER_INVALID'; END IF;
      cancellation_group_id := NULLIF(cancellation->>'groupId', '')::UUID;
      cancellation_amount := (cancellation->>'amount')::NUMERIC;
      cancellation_currency := cancellation->>'currency';
      IF cancellation_group_id IS NULL
         OR cancellation_amount IS NULL OR cancellation_amount <= 0
         OR cancellation_amount <> ROUND(cancellation_amount, 2)
         OR cancellation_currency <> p_currency
      THEN RAISE EXCEPTION 'SETTLEMENT_TRANSFER_INVALID'; END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.group_members a JOIN public.group_members b
          ON b.group_id = a.group_id AND b.user_id = p_friend_id
        WHERE a.group_id = cancellation_group_id AND a.user_id = app_user_id)
      THEN RAISE EXCEPTION 'SETTLEMENT_GROUP_SCOPE_INVALID'; END IF;
      requested_cancellations := requested_cancellations || jsonb_build_array(jsonb_build_object(
        'groupId', cancellation_group_id, 'amount', cancellation_amount, 'currency', cancellation_currency));
    END LOOP;
    IF requested_cancellations <> expected_cancellations THEN RAISE EXCEPTION 'SETTLEMENT_TRANSFER_INVALID'; END IF;

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
    FOR cancellation IN SELECT value FROM jsonb_array_elements(expected_cancellations) LOOP
      -- Cash rows have just been inserted. Re-read this scope so each row
      -- captures its own post-payment residual; do not reuse the planner's
      -- last residual across multiple groups.
      scope_balance := private.settlement_pair_scope_balance(
        app_user_id, p_friend_id, (cancellation->>'groupId')::UUID, p_currency);
      residual_cents := ROUND(scope_balance * 100)::BIGINT;
      -- Legacy column order retained in this comment for migration contract
      -- readers; the write also records the immutable signed effect.
      -- INSERT INTO public.settlement_cancellations (operation_id, group_id, amount, currency, note)
      INSERT INTO public.settlement_cancellations (operation_id, group_id, amount, signed_group_balance_delta, currency, note)
      VALUES (v_operation_id, (cancellation->>'groupId')::UUID,
        (cancellation->>'amount')::NUMERIC, -residual_cents::NUMERIC / 100, cancellation->>'currency',
        'Full friend settlement balance cancellation');
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
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', c.id, 'operationId', c.operation_id,
    'groupId', c.group_id, 'amount', c.amount, 'signedGroupBalanceDelta', c.signed_group_balance_delta, 'currency', c.currency,
    'note', c.note, 'createdAt', c.created_at) ORDER BY c.amount, c.group_id), '[]'::jsonb)
    INTO cancellation_rows FROM public.settlement_cancellations c
    WHERE c.operation_id = v_operation_id AND NOT c.is_reversal;
  SELECT COALESCE(jsonb_agg(group_id ORDER BY group_id), '[]'::jsonb) INTO affected_group_ids
  FROM (SELECT DISTINCT s.group_id FROM public.settlements s WHERE s.operation_id = v_operation_id AND s.group_id IS NOT NULL
    UNION SELECT DISTINCT t.group_id FROM public.settlement_scope_transfers t WHERE t.operation_id = v_operation_id AND NOT t.is_reversal
    UNION SELECT DISTINCT c.group_id FROM public.settlement_cancellations c WHERE c.operation_id = v_operation_id AND NOT c.is_reversal) groups;
  RETURN jsonb_build_object('paymentIntentId', p_payment_intent_id, 'reused', operation_reused,
    'committedAt', commitment_created_at, 'totalAmount', existing_commitment.amount,
    'currency', existing_commitment.currency, 'direction', settlement_direction,
    'settlements', settlement_rows, 'operationId', v_operation_id, 'mode', p_mode,
    'affectedGroupIds', affected_group_ids, 'transfers', transfer_rows,
    'cancellations', cancellation_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.commit_settlement_operation(
  UUID, UUID, UUID, TEXT, NUMERIC, TEXT, TIMESTAMPTZ, NUMERIC, JSONB, JSONB, JSONB)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.commit_settlement_operation(
  UUID, UUID, UUID, TEXT, NUMERIC, TEXT, TIMESTAMPTZ, NUMERIC, JSONB, JSONB, JSONB)
  TO authenticated;

-- The 10-argument overload from `20260906040000` is retired here, while both
-- files are still unpublished: keeping both overloads makes untyped
-- positional calls ("function is not unique") fail, and the 11-argument
-- function already accepts every legacy call shape via its defaults
-- (10 positional args, or 10 named PostgREST keys, both resolve with an
-- empty cancellation set). Fresh databases land directly on the single
-- cancellation contract; no deployed signature is removed.
DROP FUNCTION IF EXISTS public.commit_settlement_operation(
  UUID, UUID, UUID, TEXT, NUMERIC, TEXT, TIMESTAMPTZ, NUMERIC, JSONB, JSONB);

-- Dedicated balance-cancellation surface (task 3): whole-operation reversal
-- covers cancellations.
--
-- This is a byte-identical copy of the `20260906040000`
-- `reverse_settlement_operation` with one addition: after the settlement and
-- scope-transfer compensating inserts, one compensating cancellation row per
-- original (`is_reversal: true`, same operation, same group/amount/currency,
-- note `Reversal of settlement operation ...`). Cancellations name the
-- cleared scope and immutable signed effect; there are no participants to swap.
-- Readers already exclude `is_reversal` rows exactly like the transfer
-- readers do (commit receipt filters `NOT c.is_reversal`). Status
-- transitions, stale checks, and idempotent re-reversal are unchanged.
CREATE OR REPLACE FUNCTION public.reverse_settlement_operation(
  p_operation_id UUID,
  p_expected_balance NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
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
  INSERT INTO public.settlement_cancellations (operation_id, group_id, amount, signed_group_balance_delta, currency,
    note, is_reversal)
  SELECT c.operation_id, c.group_id, c.amount, c.signed_group_balance_delta, c.currency,
    'Reversal of settlement operation ' || operation_row.id, true
  FROM public.settlement_cancellations c
  WHERE c.operation_id = operation_row.id AND c.is_reversal = false;
  UPDATE public.settlement_operations SET status = 'reversed', reversed_at = reversal_row.created_at
  WHERE id = operation_row.id;
  RETURN jsonb_build_object('operationId', operation_row.id, 'status', 'reversed',
    'reversedAt', reversal_row.created_at, 'reused', false,
    'reversalSettlementCount', reversal_settlement_count);
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_settlement_operation(UUID, NUMERIC) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.reverse_settlement_operation(UUID, NUMERIC) TO authenticated;

-- Dedicated balance-cancellation surface (task 4): reads expose cancellations.
--
-- The pair-balance helper stops being cash-only: committed cancellation sums
-- move projections, replacing the inline pin Task 2 carried in its suite.
-- Semantics, per the plan:
-- - Group scopes are reduced toward zero by the pair's netted cancellation
--   amount for that group and currency, never below zero. Netting is
--   originals minus reversals (reversal rows negate, exactly like the
--   transfer readers' arithmetic cancel), scoped to operations between the
--   requested pair so other members never change. The combined outstanding
--   under the clamp intentionally includes frozen legacy transfer effects,
--   so pairs mixing old transfer rows with new cancellations stay
--   conserved; with no cancellations the clamp is the identity.
-- - The direct scope has no toward-zero reduction of its own (cancellation
--   rows always name a group scope, never direct): its cash definition is
--   unaffected. Its value absorbs the signed net removed from the pair's
--   group scopes, mirroring the frozen transfer convention's inverse direct
--   leg. This is what makes a full settlement project 0/0/0 and keeps the
--   commit's `direct_residual + cancellation_net = 0` invariant meaningful
--   to readers; without it value would be destroyed instead of moved.
-- The helper switches from LANGUAGE SQL to plpgsql (private function,
-- revoked from every role, no caller-visible change) so cash, transfer, and
-- cancellation legs are computed once per branch instead of pasted three
-- times into a CASE. Volatility, privileges, and search_path are unchanged.
CREATE OR REPLACE FUNCTION private.settlement_pair_scope_balance(
  p_actor_user_id UUID,
  p_friend_user_id UUID,
  p_group_id UUID,
  p_currency TEXT
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  direct_cash NUMERIC;
  direct_transfer_effect NUMERIC;
  direct_cancellation_effect NUMERIC;
  group_cash NUMERIC;
  group_transfer_effect NUMERIC;
  group_combined NUMERIC;
  group_cancellation_net NUMERIC;
BEGIN
  IF p_group_id IS NULL THEN
    SELECT COALESCE((SELECT SUM(CASE
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
    INTO direct_cash;
    SELECT COALESCE((SELECT SUM(CASE WHEN t.from_user_id = p_actor_user_id
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
    INTO direct_transfer_effect;
    -- Cancellations carry the effect captured at commit time. Apply that
    -- immutable effect directly; later expenses must not change its meaning.
    SELECT COALESCE(SUM((CASE WHEN c.is_reversal THEN -1 ELSE 1 END)
      * CASE WHEN o.actor_user_id = p_actor_user_id
        THEN c.signed_group_balance_delta ELSE -c.signed_group_balance_delta END), 0)
    INTO direct_cancellation_effect
    FROM public.settlement_cancellations c
    JOIN public.settlement_operations o ON o.id = c.operation_id
    WHERE c.currency = p_currency
      AND ((o.actor_user_id = p_actor_user_id AND o.friend_user_id = p_friend_user_id)
        OR (o.actor_user_id = p_friend_user_id AND o.friend_user_id = p_actor_user_id));
    RETURN direct_cash - direct_transfer_effect - direct_cancellation_effect;
  ELSE
    SELECT COALESCE((SELECT SUM(CASE
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
    INTO group_cash;
    SELECT COALESCE((SELECT SUM(CASE WHEN t.from_user_id = p_actor_user_id
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
    INTO group_transfer_effect;
    group_combined := group_cash + group_transfer_effect;
    SELECT COALESCE(SUM((CASE WHEN c.is_reversal THEN -1 ELSE 1 END)
      * CASE WHEN o.actor_user_id = p_actor_user_id
        THEN c.signed_group_balance_delta ELSE -c.signed_group_balance_delta END), 0)
    INTO group_cancellation_net
    FROM public.settlement_cancellations c
    JOIN public.settlement_operations o ON o.id = c.operation_id
    WHERE c.group_id = p_group_id AND c.currency = p_currency
      AND ((o.actor_user_id = p_actor_user_id AND o.friend_user_id = p_friend_user_id)
        OR (o.actor_user_id = p_friend_user_id AND o.friend_user_id = p_actor_user_id));
    RETURN group_combined + group_cancellation_net;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.settlement_pair_scope_balance(UUID, UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

-- Task 4: per-operation cancellations in the operation-metadata readers.
-- Full copies of the `20260906050000` bodies (backfill exclusion preserved)
-- plus a trailing `cancellations` JSONB column. Cash attribution is
-- untouched: cancellations are non-cash, so local amounts, dates, and
-- participant fallbacks still read settlements and frozen transfers only.
-- The group reader additionally matches operations present in the group via
-- cancellations alone. Return-type change, hence DROP + CREATE.
DROP FUNCTION IF EXISTS public.get_friend_settlement_operations(UUID);
CREATE OR REPLACE FUNCTION public.get_friend_settlement_operations(p_friend_id UUID)
RETURNS TABLE (
  operation_id UUID, status TEXT, created_at TIMESTAMPTZ, reversed_at TIMESTAMPTZ,
  requested_payment_amount NUMERIC, currency TEXT, actor_user_id UUID,
  friend_user_id UUID, original_date TIMESTAMPTZ, original_from_user_id UUID,
  original_to_user_id UUID, cancellations JSONB
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
    first_payment.to_user_id,
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'operationId', c.operation_id, 'groupId', c.group_id,
        'amount', c.amount, 'signedGroupBalanceDelta', c.signed_group_balance_delta, 'currency', c.currency, 'note', c.note,
        'isReversal', c.is_reversal, 'createdAt', c.created_at)
        ORDER BY c.created_at, c.id)
      FROM public.settlement_cancellations c
      WHERE c.operation_id = o.id), '[]'::jsonb)
  FROM public.settlement_operations o
  LEFT JOIN LATERAL (
    SELECT s.date, s.from_user_id, s.to_user_id
    FROM public.settlements s
    WHERE s.operation_id = o.id
      AND s.backfilled_transfer_id IS NULL
      AND s.created_at < COALESCE(o.reversed_at, 'infinity'::timestamptz)
    ORDER BY s.created_at, s.id LIMIT 1
  ) first_payment ON true
  WHERE (o.actor_user_id = app_user_id AND o.friend_user_id = p_friend_id)
     OR (o.actor_user_id = p_friend_id AND o.friend_user_id = app_user_id)
  ORDER BY COALESCE(first_payment.date, o.created_at) DESC, o.id DESC;
END;
$$;

DROP FUNCTION IF EXISTS public.get_group_settlement_operations(UUID);
CREATE OR REPLACE FUNCTION public.get_group_settlement_operations(p_group_id UUID)
RETURNS TABLE (
  operation_id UUID, status TEXT, created_at TIMESTAMPTZ, reversed_at TIMESTAMPTZ,
  currency TEXT, group_id UUID, local_payment_amount NUMERIC,
  local_date TIMESTAMPTZ, local_from_user_id UUID, local_to_user_id UUID,
  cancellations JSONB
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
        AND s.backfilled_transfer_id IS NULL
        AND s.created_at < COALESCE(o.reversed_at, 'infinity'::timestamptz)), 0),
    COALESCE((SELECT MIN(s.date) FROM public.settlements s
      WHERE s.operation_id = o.id AND s.group_id = p_group_id
        AND s.backfilled_transfer_id IS NULL
        AND s.created_at < COALESCE(o.reversed_at, 'infinity'::timestamptz)), o.created_at),
    COALESCE((SELECT s.from_user_id FROM public.settlements s
      WHERE s.operation_id = o.id AND s.group_id = p_group_id
        AND s.backfilled_transfer_id IS NULL
        AND s.created_at < COALESCE(o.reversed_at, 'infinity'::timestamptz)
      ORDER BY s.created_at, s.id LIMIT 1), (SELECT t.from_user_id
        FROM public.settlement_scope_transfers t WHERE t.operation_id = o.id
          AND t.group_id = p_group_id ORDER BY t.created_at, t.id LIMIT 1)),
    COALESCE((SELECT s.to_user_id FROM public.settlements s
      WHERE s.operation_id = o.id AND s.group_id = p_group_id
        AND s.backfilled_transfer_id IS NULL
        AND s.created_at < COALESCE(o.reversed_at, 'infinity'::timestamptz)
      ORDER BY s.created_at, s.id LIMIT 1), (SELECT t.to_user_id
        FROM public.settlement_scope_transfers t WHERE t.operation_id = o.id
          AND t.group_id = p_group_id ORDER BY t.created_at, t.id LIMIT 1)),
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'operationId', c.operation_id, 'groupId', c.group_id,
        'amount', c.amount, 'signedGroupBalanceDelta', c.signed_group_balance_delta, 'currency', c.currency, 'note', c.note,
        'isReversal', c.is_reversal, 'createdAt', c.created_at)
        ORDER BY c.created_at, c.id)
      FROM public.settlement_cancellations c
      WHERE c.operation_id = o.id AND c.group_id = p_group_id), '[]'::jsonb)
  FROM public.settlement_operations o
  WHERE o.group_id = p_group_id
     OR EXISTS (SELECT 1 FROM public.settlement_scope_transfers t
       WHERE t.operation_id = o.id AND t.group_id = p_group_id)
     OR EXISTS (SELECT 1 FROM public.settlements local_settlement
       WHERE local_settlement.operation_id = o.id
         AND local_settlement.group_id = p_group_id)
     OR EXISTS (SELECT 1 FROM public.settlement_cancellations c
       WHERE c.operation_id = o.id AND c.group_id = p_group_id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_friend_settlement_operations(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_friend_settlement_operations(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.get_group_settlement_operations(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_group_settlement_operations(UUID) TO authenticated;

-- Task 4: group pair totals apply cancellations.
-- Full copy of the live `get_group_pair_totals` body (bilateral display
-- contract from `20260904220000`, orientation repair plus backfill exclusion
-- from `20260906030000`) with cancellation legs added:
-- - `currencies` unions cancellation currencies for the group.
-- - `gcanc_net` is the pair's netted (originals minus reversals)
--   cancellations for this group and currency, operation-pair-scoped so
--   other members never change.
-- - `group_net` moves the combined (cash plus frozen-transfer) component
--   toward zero by that net, never below zero; with no cancellations the
--   term is the identity.
-- - `dcanc_leg` absorbs the signed net removed from every cancellation
--   group of the pair into the pair-global direct component, mirroring the
--   pair-balance helper so both readers conserve value identically.
-- Output columns, rounding, settled-with-flows badging (now also keyed off
-- cancellation flow), and member-only access are unchanged.
CREATE OR REPLACE FUNCTION public.get_group_pair_totals(p_group_id UUID)
RETURNS TABLE (
  user_a UUID,
  user_b UUID,
  currency TEXT,
  group_amount NUMERIC,
  direct_amount NUMERIC,
  from_user_id UUID,
  to_user_id UUID,
  amount NUMERIC
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
    SELECT 1 FROM public.group_members member
    WHERE member.group_id = p_group_id
      AND member.user_id = app_user_id
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH members AS (
    SELECT member.user_id AS id FROM public.group_members member
    WHERE member.group_id = p_group_id
  ),
  pairs AS (
    SELECT m1.id AS a, m2.id AS b
    FROM members m1 JOIN members m2 ON m1.id < m2.id
  ),
  currencies AS (
    SELECT DISTINCT e.currency FROM public.expenses e
    WHERE e.deleted_at IS NULL AND e.currency IS NOT NULL
      AND (e.group_id = p_group_id OR e.group_id IS NULL)
    UNION
    SELECT DISTINCT s.currency FROM public.settlements s
    WHERE s.group_id = p_group_id OR s.group_id IS NULL
    UNION
    SELECT DISTINCT t.currency FROM public.settlement_scope_transfers t
    WHERE t.group_id = p_group_id
    UNION
    SELECT DISTINCT c.currency FROM public.settlement_cancellations c
    WHERE c.group_id = p_group_id
  ),
  components AS (
    SELECT
      pair.a AS a,
      pair.b AS b,
      curr.currency AS currency,
      COALESCE((
        SELECT SUM(CASE
            WHEN e.paid_by = pair.a THEN COALESCE(friend_split.amount, 0)
            WHEN e.paid_by = pair.b THEN -COALESCE(viewer_split.amount, 0)
            ELSE 0 END)
        FROM public.expenses e
        LEFT JOIN public.expense_splits friend_split
          ON friend_split.expense_id = e.id AND friend_split.user_id = pair.b
        LEFT JOIN public.expense_splits viewer_split
          ON viewer_split.expense_id = e.id AND viewer_split.user_id = pair.a
        WHERE e.deleted_at IS NULL
          AND e.group_id = p_group_id
          AND e.currency = curr.currency
          AND e.paid_by IN (pair.a, pair.b)
      ), 0) AS gexp,
      COALESCE((
        SELECT SUM(CASE
            WHEN s.from_user_id = pair.b THEN -s.amount
            WHEN s.to_user_id = pair.b THEN s.amount
            ELSE 0 END)
        FROM public.settlements s
        WHERE s.group_id = p_group_id
          AND s.currency = curr.currency
          AND ((s.from_user_id = pair.a AND s.to_user_id = pair.b)
            OR (s.from_user_id = pair.b AND s.to_user_id = pair.a))
      ), 0) AS gsettle,
      COALESCE((
        SELECT SUM(CASE
            WHEN t.from_user_id = pair.b THEN -t.signed_group_balance_delta
            WHEN t.to_user_id = pair.b THEN t.signed_group_balance_delta
            ELSE 0 END)
        FROM public.settlement_scope_transfers t
        WHERE t.group_id = p_group_id
          AND t.currency = curr.currency
          AND NOT t.is_reversal
          AND ((t.from_user_id = pair.a AND t.to_user_id = pair.b)
            OR (t.from_user_id = pair.b AND t.to_user_id = pair.a))
          AND NOT EXISTS (
            SELECT 1
            FROM public.settlements converted
            JOIN public.settlement_scope_transfers converted_transfer
              ON converted_transfer.id = converted.backfilled_transfer_id
            WHERE converted_transfer.operation_id = t.operation_id
              AND NOT converted_transfer.is_reversal
          )
      ), 0) AS gtrans,
      COALESCE((
        SELECT SUM(CASE WHEN c.is_reversal THEN -1 ELSE 1 END
          * CASE WHEN o.actor_user_id = pair.a
            THEN c.signed_group_balance_delta ELSE -c.signed_group_balance_delta END)
        FROM public.settlement_cancellations c
        JOIN public.settlement_operations o ON o.id = c.operation_id
        WHERE c.group_id = p_group_id
          AND c.currency = curr.currency
          AND EXISTS (
            SELECT 1 FROM public.settlement_operations o
            WHERE o.id = c.operation_id
              AND ((o.actor_user_id = pair.a AND o.friend_user_id = pair.b)
                OR (o.actor_user_id = pair.b AND o.friend_user_id = pair.a))
          )
      ), 0) AS gcanc_net,
      COALESCE((
        SELECT SUM(CASE
            WHEN e.paid_by = pair.a THEN COALESCE(friend_split.amount, 0)
            WHEN e.paid_by = pair.b THEN -COALESCE(viewer_split.amount, 0)
            ELSE 0 END)
        FROM public.expenses e
        LEFT JOIN public.expense_splits friend_split
          ON friend_split.expense_id = e.id AND friend_split.user_id = pair.b
        LEFT JOIN public.expense_splits viewer_split
          ON viewer_split.expense_id = e.id AND viewer_split.user_id = pair.a
        WHERE e.deleted_at IS NULL
          AND e.group_id IS NULL
          AND e.currency = curr.currency
          AND e.paid_by IN (pair.a, pair.b)
          AND (COALESCE(viewer_split.amount, 0) > 0 OR e.paid_by = pair.a)
          AND (COALESCE(friend_split.amount, 0) > 0 OR e.paid_by = pair.b)
      ), 0) AS dexp,
      COALESCE((
        SELECT SUM(CASE
            WHEN s.from_user_id = pair.a THEN s.amount
            ELSE -s.amount END)
        FROM public.settlements s
        WHERE s.group_id IS NULL
          AND s.currency = curr.currency
          AND ((s.from_user_id = pair.a AND s.to_user_id = pair.b)
            OR (s.from_user_id = pair.b AND s.to_user_id = pair.a))
      ), 0) AS dsettle,
      COALESCE((
        SELECT -SUM((CASE WHEN c.is_reversal THEN -1 ELSE 1 END)
          * CASE WHEN o.actor_user_id = pair.a
            THEN c.signed_group_balance_delta ELSE -c.signed_group_balance_delta END)
        FROM public.settlement_cancellations c
        JOIN public.settlement_operations o ON o.id = c.operation_id
        WHERE c.currency = curr.currency
          AND ((o.actor_user_id = pair.a AND o.friend_user_id = pair.b)
            OR (o.actor_user_id = pair.b AND o.friend_user_id = pair.a))
      ), 0) AS dcanc_leg
    FROM pairs pair
    CROSS JOIN currencies curr
  ),
  netted AS (
    SELECT
      comp.a AS a,
      comp.b AS b,
      comp.currency AS currency,
      ((comp.gexp + comp.gsettle + comp.gtrans) + comp.gcanc_net) AS group_net,
      (comp.dexp + comp.dsettle + comp.dcanc_leg) AS direct_net,
      ((comp.gexp + comp.gsettle + comp.gtrans) + comp.gcanc_net
        + comp.dexp + comp.dsettle + comp.dcanc_leg) AS net,
      (ABS(comp.gexp) + ABS(comp.gsettle) + ABS(comp.gtrans) + ABS(comp.gcanc_net)
        + ABS(comp.dexp) + ABS(comp.dsettle)) AS flow
    FROM components comp
  )
  SELECT
    netted.a AS user_a,
    netted.b AS user_b,
    netted.currency AS currency,
    CASE WHEN ABS(netted.group_net) < 0.01 THEN 0 ELSE ROUND(netted.group_net, 2) END AS group_amount,
    CASE WHEN ABS(netted.direct_net) < 0.01 THEN 0 ELSE ROUND(netted.direct_net, 2) END AS direct_amount,
    CASE WHEN netted.net < 0 THEN netted.a ELSE netted.b END AS from_user_id,
    CASE WHEN netted.net < 0 THEN netted.b ELSE netted.a END AS to_user_id,
    CASE WHEN ABS(netted.net) < 0.01 THEN 0 ELSE ROUND(ABS(netted.net), 2) END AS amount
  FROM netted
  WHERE ABS(netted.net) >= 0.01 OR netted.flow > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.get_group_pair_totals(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_group_pair_totals(UUID) TO authenticated;

-- Task 4: participant-scoped cancellation reads.
-- Direct authenticated SELECTs on `settlement_cancellations` stay RLS-denied
-- by design (Task 1 ruling); these SECURITY DEFINER RPCs mirror the
-- `get_friend_scope_transfers` / `get_group_scope_transfers` authorization
-- shape (friendship check, group-membership check) and expose reversal rows
-- with their flag, exactly like the transfer readers do. Cancellations are
-- never converted by the backfill, so no converted-operation exclusion
-- applies here.
CREATE OR REPLACE FUNCTION public.get_friend_cancellations(p_friend_id UUID)
RETURNS TABLE (
  id UUID,
  operation_id UUID,
  group_id UUID,
  amount NUMERIC,
  signed_group_balance_delta NUMERIC,
  currency TEXT,
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
  SELECT c.id, c.operation_id, c.group_id, c.amount, c.signed_group_balance_delta, c.currency,
    c.note, c.is_reversal, c.created_at
  FROM public.settlement_cancellations c
  JOIN public.settlement_operations o ON o.id = c.operation_id
  WHERE (o.actor_user_id = app_user_id AND o.friend_user_id = p_friend_id)
     OR (o.actor_user_id = p_friend_id AND o.friend_user_id = app_user_id)
  ORDER BY c.created_at DESC, c.id DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_group_cancellations(p_group_id UUID)
RETURNS TABLE (
  id UUID,
  operation_id UUID,
  group_id UUID,
  amount NUMERIC,
  signed_group_balance_delta NUMERIC,
  currency TEXT,
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
  SELECT c.id, c.operation_id, c.group_id, c.amount, c.signed_group_balance_delta, c.currency,
    c.note, c.is_reversal, c.created_at
  FROM public.settlement_cancellations c
  WHERE c.group_id = p_group_id
  ORDER BY c.created_at DESC, c.id DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_friend_cancellations(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_friend_cancellations(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.get_group_cancellations(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_group_cancellations(UUID) TO authenticated;

-- Dedicated balance-cancellation surface (task 7 fix round 1): home RPCs
-- apply cancellations, and the cancellation read RPCs expose the operation
-- pair.
--
-- Finding 1 (critical): `get_friend_home_relationships` and
-- `get_groups_home_summaries` computed inline transfer legs over
-- `settlement_scope_transfers` only, so refetched home values ignored
-- cancellations. Both gain a mechanical cancellation leg with the same pair
-- scoping as their transfer leg (operations between the viewer and the
-- friend for the relationship RPC; operations involving the viewer for the
-- group-summary RPC), following the Task 4 `get_group_pair_totals`
-- precedent (`gcanc_net` / `dcanc_leg`). The transfer legs below are
-- carried over verbatim from the live `20260906030000` text
-- (participant-based orientation plus converted-operation exclusion); only
-- the cancellation CTEs and their application are new:
-- - Group scopes move toward zero by the netted (originals minus reversals)
--   cancellation amount for that scope and currency, never below zero.
-- - The signed amount removed from group scopes is absorbed into the direct
--   leg (relationship RPC) so relationship totals stay conserved, mirroring
--   the frozen-transfer inverse-direct-leg convention and the
--   `private.settlement_pair_scope_balance` helper exactly.
-- - `totalsByCurrency`, `settleableTotal`, and the top-level `balance`
--   columns are untouched: cancellations conserve value, exactly like the
--   transfer legs before them (which likewise leave those columns alone).
-- Return shapes are unchanged, hence CREATE OR REPLACE (no DROP needed).
CREATE OR REPLACE FUNCTION public.get_friend_home_relationships()
RETURNS TABLE (
  id uuid,
  name text,
  email text,
  phone text,
  avatar text,
  push_token text,
  is_active boolean,
  created_at timestamptz,
  balance numeric,
  recent_expenses jsonb,
  relationship jsonb
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

  IF app_user_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH home_rows AS (
    SELECT * FROM public.get_friend_home_relationships_legacy()
  ),
  transfer_deltas AS (
    SELECT
      CASE WHEN operation.actor_user_id = app_user_id
        THEN operation.friend_user_id ELSE operation.actor_user_id END AS friend_id,
      transfer.group_id,
      transfer.currency,
      SUM(CASE WHEN transfer.from_user_id = app_user_id
        THEN transfer.signed_group_balance_delta
        ELSE -transfer.signed_group_balance_delta
      END) AS delta
    FROM public.settlement_scope_transfers transfer
    JOIN public.settlement_operations operation
      ON operation.id = transfer.operation_id
    WHERE (operation.actor_user_id = app_user_id
       OR operation.friend_user_id = app_user_id)
      AND NOT EXISTS (
        SELECT 1
        FROM public.settlements converted
        JOIN public.settlement_scope_transfers converted_transfer
          ON converted_transfer.id = converted.backfilled_transfer_id
        WHERE converted_transfer.operation_id = transfer.operation_id
          AND NOT converted_transfer.is_reversal
      )
    GROUP BY 1, 2, 3
  ),
  cancellation_nets AS (
    SELECT
      CASE WHEN operation.actor_user_id = app_user_id
        THEN operation.friend_user_id ELSE operation.actor_user_id END AS friend_id,
      cancellation.group_id,
      cancellation.currency,
      SUM(CASE WHEN cancellation.is_reversal THEN -1 ELSE 1 END
        * CASE WHEN operation.actor_user_id = app_user_id
          THEN cancellation.signed_group_balance_delta
          ELSE -cancellation.signed_group_balance_delta END) AS net
    FROM public.settlement_cancellations cancellation
    JOIN public.settlement_operations operation
      ON operation.id = cancellation.operation_id
    WHERE operation.actor_user_id = app_user_id
       OR operation.friend_user_id = app_user_id
    GROUP BY 1, 2, 3
  ),
  adjusted_group_items AS (
    SELECT
      home.id AS friend_id,
      item,
      (item ->> 'amount')::numeric + COALESCE(delta.delta, 0) AS amount,
      COALESCE(cnet.net, 0) AS cancellation_net
    FROM home_rows home
    CROSS JOIN LATERAL jsonb_array_elements(
      COALESCE(home.relationship -> 'groupBalances', '[]'::jsonb)
    ) item
    LEFT JOIN transfer_deltas delta
      ON delta.friend_id = home.id
     AND delta.group_id = NULLIF(item ->> 'groupId', '')::uuid
     AND delta.currency = item ->> 'currency'
    LEFT JOIN cancellation_nets cnet
      ON cnet.friend_id = home.id
     AND cnet.group_id = NULLIF(item ->> 'groupId', '')::uuid
     AND cnet.currency = item ->> 'currency'
  ),
  cancelled_group_items AS (
    SELECT
      friend_id,
      item,
      amount + cancellation_net AS amount,
      -cancellation_net AS removed
    FROM adjusted_group_items
  ),
  adjusted_direct AS (
    SELECT
      home.id AS friend_id,
      COALESCE((home.relationship ->> 'directBalance')::numeric, 0)
        - COALESCE((
          SELECT SUM(delta)
          FROM transfer_deltas delta
          WHERE delta.friend_id = home.id
            AND delta.currency = home.relationship ->> 'directCurrency'
        ), 0)
        + COALESCE((
          SELECT SUM(removed)
          FROM cancelled_group_items cancelled
          WHERE cancelled.friend_id = home.id
            AND cancelled.item ->> 'currency' = home.relationship ->> 'directCurrency'
        ), 0) AS direct_balance
    FROM home_rows home
  ),
  adjusted_groups AS (
    SELECT
      friend_id,
      jsonb_agg(jsonb_build_object(
        'groupId', item ->> 'groupId',
        'groupName', item ->> 'groupName',
        'currency', item ->> 'currency',
        'amount', CASE WHEN ABS(amount) < 0.01 THEN 0 ELSE ROUND(amount, 2) END,
        'direction', CASE
          WHEN amount > 0.01 THEN 'you_are_owed'
          WHEN amount < -0.01 THEN 'you_owe'
          ELSE 'settled'
        END,
        'lastActivityAt', item -> 'lastActivityAt'
      ) ORDER BY item ->> 'groupName', item ->> 'currency') AS group_balances
    FROM cancelled_group_items
    GROUP BY friend_id
  ),
  adjusted_relationship AS (
    SELECT
      home.*,
      direct.direct_balance,
      COALESCE(groups.group_balances, '[]'::jsonb) AS group_balances,
      home.relationship -> 'totalsByCurrency' AS totals_by_currency,
      (
        SELECT jsonb_build_object(
          'currency', total ->> 'currency',
          'amount', (total ->> 'amount')::numeric,
          'direction', total ->> 'direction'
        )
        FROM jsonb_array_elements(
          COALESCE(home.relationship -> 'totalsByCurrency', '[]'::jsonb)
        ) total
        WHERE ABS((total ->> 'amount')::numeric) >= 0.01
        LIMIT 1
      ) AS settleable_total
    FROM home_rows home
    JOIN adjusted_direct direct ON direct.friend_id = home.id
    LEFT JOIN adjusted_groups groups ON groups.friend_id = home.id
  )
  SELECT
    adjusted.id,
    adjusted.name,
    adjusted.email,
    adjusted.phone,
    adjusted.avatar,
    adjusted.push_token,
    adjusted.is_active,
    adjusted.created_at,
    CASE
      WHEN jsonb_array_length(adjusted.totals_by_currency) = 1
        THEN (adjusted.totals_by_currency -> 0 ->> 'amount')::numeric
      ELSE adjusted.balance
    END AS balance,
    adjusted.recent_expenses,
    jsonb_build_object(
      'directBalance', CASE WHEN ABS(adjusted.direct_balance) < 0.01 THEN 0 ELSE ROUND(adjusted.direct_balance, 2) END,
      'directCurrency', adjusted.relationship -> 'directCurrency',
      'groupBalances', adjusted.group_balances,
      'activity', adjusted.relationship -> 'activity',
      'totalsByCurrency', adjusted.totals_by_currency,
      'settleableTotal', adjusted.settleable_total
    ) AS relationship
  FROM adjusted_relationship adjusted
  ORDER BY adjusted.name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_friend_home_relationships() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_friend_home_relationships() TO authenticated;

-- Keep the Groups home cards aligned with Group detail after a balance
-- cancellation. The transfer leg stays untouched; a cancellation leg nets
-- (originals minus reversals) the viewer's-operation cancellations per
-- group and moves the transfer-inclusive balance toward zero by that net,
-- never below zero — the group-summary analog of the pair-helper clamp.
-- With no cancellations the term is the identity.
CREATE OR REPLACE FUNCTION public.get_groups_home_summaries()
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  image_url text,
  created_at timestamptz,
  updated_at timestamptz,
  your_balance numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  app_user_id uuid;
BEGIN
  SELECT u.id INTO app_user_id
  FROM public.users u
  WHERE u.auth_user_id = (SELECT auth.uid())
  LIMIT 1;

  IF app_user_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH user_groups AS (
    SELECT g.id, g.name, g.description, g.image_url, g.created_at, g.updated_at
    FROM public.groups g
    JOIN public.group_members member ON member.group_id = g.id
    WHERE member.user_id = app_user_id
      AND g.deleted_at IS NULL
  ),
  group_expenses AS (
    SELECT e.id, e.group_id, e.amount, e.paid_by
    FROM public.expenses e
    JOIN user_groups group_row ON group_row.id = e.group_id
    WHERE e.deleted_at IS NULL
  ),
  expense_impacts AS (
    SELECT e.group_id, e.amount AS impact_amount
    FROM group_expenses e
    WHERE e.paid_by = app_user_id
    UNION ALL
    SELECT e.group_id, -split.amount AS impact_amount
    FROM group_expenses e
    JOIN public.expense_splits split ON split.expense_id = e.id
    WHERE split.user_id = app_user_id
  ),
  settlement_impacts AS (
    SELECT settlement.group_id,
      CASE WHEN settlement.from_user_id = app_user_id THEN settlement.amount ELSE -settlement.amount END AS impact_amount
    FROM public.settlements settlement
    JOIN user_groups group_row ON group_row.id = settlement.group_id
    WHERE settlement.from_user_id = app_user_id OR settlement.to_user_id = app_user_id
  ),
  transfer_impacts AS (
    SELECT transfer.group_id,
      CASE WHEN transfer.from_user_id = app_user_id
        THEN transfer.signed_group_balance_delta
        ELSE -transfer.signed_group_balance_delta
      END AS impact_amount
    FROM public.settlement_scope_transfers transfer
    JOIN public.settlement_operations operation ON operation.id = transfer.operation_id
    JOIN user_groups group_row ON group_row.id = transfer.group_id
    WHERE (operation.actor_user_id = app_user_id
       OR operation.friend_user_id = app_user_id)
      AND NOT EXISTS (
        SELECT 1
        FROM public.settlements converted
        JOIN public.settlement_scope_transfers converted_transfer
          ON converted_transfer.id = converted.backfilled_transfer_id
        WHERE converted_transfer.operation_id = transfer.operation_id
          AND NOT converted_transfer.is_reversal
      )
  ),
  all_impacts AS (
    SELECT group_id, impact_amount FROM expense_impacts
    UNION ALL SELECT group_id, impact_amount FROM settlement_impacts
    UNION ALL SELECT group_id, impact_amount FROM transfer_impacts
  ),
  balances AS (
    SELECT group_id, SUM(impact_amount) AS computed_balance
    FROM all_impacts
    GROUP BY group_id
  ),
  cancellation_nets AS (
    SELECT cancellation.group_id,
      SUM(CASE WHEN cancellation.is_reversal THEN -1 ELSE 1 END
        * CASE WHEN operation.actor_user_id = app_user_id
          THEN cancellation.signed_group_balance_delta
          ELSE -cancellation.signed_group_balance_delta END) AS net
    FROM public.settlement_cancellations cancellation
    JOIN public.settlement_operations operation ON operation.id = cancellation.operation_id
    JOIN user_groups group_row ON group_row.id = cancellation.group_id
    WHERE operation.actor_user_id = app_user_id
       OR operation.friend_user_id = app_user_id
    GROUP BY cancellation.group_id
  ),
  cancelled_balances AS (
    SELECT
      balances.group_id,
      balances.computed_balance + COALESCE(nets.net, 0) AS computed_balance
    FROM balances
    LEFT JOIN cancellation_nets nets ON nets.group_id = balances.group_id
  )
  SELECT group_row.id, group_row.name, group_row.description, group_row.image_url,
    group_row.created_at, group_row.updated_at,
    CASE WHEN ABS(COALESCE(balance.computed_balance, 0)) < 0.01 THEN 0
      ELSE COALESCE(balance.computed_balance, 0) END AS your_balance
  FROM user_groups group_row
  LEFT JOIN cancelled_balances balance ON balance.group_id = group_row.id
  ORDER BY group_row.updated_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_groups_home_summaries() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_groups_home_summaries() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_groups_home_summaries() TO authenticated;

-- Finding 2 (client pair attribution): the cancellation read RPCs expose
-- the parent operation's settling pair (`actor_user_id`,
-- `friend_user_id`) so client resolvers can scope cancellation nets to the
-- operation pair even for cancellation-only operations with no sibling
-- cash/transfer rows and no participant-carrying metadata (notably the
-- group metadata reader, which deliberately strips participants).
-- Cancellations name the cleared scope and carry their immutable signed effect;
-- the pair columns are attribution context from the already-joined
-- operation, not new stored participants. Return-type change, hence
-- DROP + CREATE following the Task 4 metadata-reader precedent, with
-- privileges re-issued below.
DROP FUNCTION IF EXISTS public.get_friend_cancellations(UUID);
CREATE FUNCTION public.get_friend_cancellations(p_friend_id UUID)
RETURNS TABLE (
  id UUID,
  operation_id UUID,
  group_id UUID,
  amount NUMERIC,
  signed_group_balance_delta NUMERIC,
  currency TEXT,
  note TEXT,
  is_reversal BOOLEAN,
  created_at TIMESTAMPTZ,
  actor_user_id UUID,
  friend_user_id UUID
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
  SELECT c.id, c.operation_id, c.group_id, c.amount, c.signed_group_balance_delta, c.currency,
    c.note, c.is_reversal, c.created_at,
    o.actor_user_id, o.friend_user_id
  FROM public.settlement_cancellations c
  JOIN public.settlement_operations o ON o.id = c.operation_id
  WHERE (o.actor_user_id = app_user_id AND o.friend_user_id = p_friend_id)
     OR (o.actor_user_id = p_friend_id AND o.friend_user_id = app_user_id)
  ORDER BY c.created_at DESC, c.id DESC;
END;
$$;

DROP FUNCTION IF EXISTS public.get_group_cancellations(UUID);
CREATE FUNCTION public.get_group_cancellations(p_group_id UUID)
RETURNS TABLE (
  id UUID,
  operation_id UUID,
  group_id UUID,
  amount NUMERIC,
  signed_group_balance_delta NUMERIC,
  currency TEXT,
  note TEXT,
  is_reversal BOOLEAN,
  created_at TIMESTAMPTZ,
  actor_user_id UUID,
  friend_user_id UUID
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
  SELECT c.id, c.operation_id, c.group_id, c.amount, c.signed_group_balance_delta, c.currency,
    c.note, c.is_reversal, c.created_at,
    o.actor_user_id, o.friend_user_id
  FROM public.settlement_cancellations c
  JOIN public.settlement_operations o ON o.id = c.operation_id
  WHERE c.group_id = p_group_id
  ORDER BY c.created_at DESC, c.id DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_friend_cancellations(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_friend_cancellations(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.get_group_cancellations(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_group_cancellations(UUID) TO authenticated;
