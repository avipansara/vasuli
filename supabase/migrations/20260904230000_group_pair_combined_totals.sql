-- Combined (direct + group) bilateral totals for every pair in a group.
--
-- The group page can only see the group ledger, so a pair that nets to zero
-- across ledgers (e.g. a spent scope offset on one side, cash on the other)
-- still looks outstanding there. This RPC gives the Balances tab the full
-- picture per pair, per currency, in ONE round trip.
--
-- Conventions mirror the bilateral display contract (actor_balance ==
-- displayed scope.amount, positive = user_a is owed):
--   expenses (group AND direct): paid_by=a -> +b_split / paid_by=b -> -a_split
--   settlements (group AND direct, pair-only):
--     from=b -> -amount / to=b -> +amount
--   scope transfers (pair-only, non-reversal):
--     from=b -> -delta / to=b -> +delta
-- Output carries group_amount and direct_amount separately (signed,
-- a-perspective) because direct is pair-global: attributing it per group
-- tab would double-count it for multi-group pairs. amount/from/to are the
-- canonical net (debtor -> creditor). Pairs whose flows net to ~zero are
-- still returned (amount 0) when any component is nonzero, so the UI can
-- badge them settled; pairs with no flows at all are omitted. Caller must
-- be a group member; no friendship required (members are not always friends).

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
      ), 0) AS gtrans,
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
      ), 0) AS dsettle
    FROM pairs pair
    CROSS JOIN currencies curr
  ),
  netted AS (
    SELECT
      comp.a AS a,
      comp.b AS b,
      comp.currency AS currency,
      (comp.gexp + comp.gsettle + comp.gtrans) AS group_net,
      (comp.dexp + comp.dsettle) AS direct_net,
      (comp.gexp + comp.gsettle + comp.gtrans + comp.dexp + comp.dsettle) AS net,
      (ABS(comp.gexp) + ABS(comp.gsettle) + ABS(comp.gtrans) + ABS(comp.dexp) + ABS(comp.dsettle)) AS flow
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
