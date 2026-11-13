-- Only the trusted sender and receipt worker can access delivery records.
CREATE TABLE public.push_receipt_checks (
  receipt_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_snapshot text NOT NULL,
  notification_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_until timestamptz,
  checked_at timestamptz,
  outcome text CHECK (outcome IN ('delivered_to_provider', 'error', 'expired')),
  error_code text,
  PRIMARY KEY (receipt_id, user_id)
);
CREATE INDEX push_receipt_checks_pending_idx ON public.push_receipt_checks (created_at)
  WHERE checked_at IS NULL;
ALTER TABLE public.push_receipt_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_receipt_checks FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_receipt_checks FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_receipt_checks TO service_role;

CREATE OR REPLACE FUNCTION public.record_push_receipts(p_tickets jsonb, p_type text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501'; END IF;
  IF jsonb_typeof(p_tickets) IS DISTINCT FROM 'array' OR jsonb_array_length(p_tickets) > 100
    OR length(p_type) > 80 OR p_type IS NULL THEN RAISE EXCEPTION 'Invalid tickets'; END IF;
  INSERT INTO public.push_receipt_checks (receipt_id, user_id, token_snapshot, notification_type)
  SELECT t.receipt_id, u.id, u.push_token, p_type
  FROM jsonb_to_recordset(p_tickets) AS t(receipt_id text, token text)
  JOIN public.users u ON u.push_token = t.token
  WHERE length(t.receipt_id) BETWEEN 1 AND 128 AND length(t.token) BETWEEN 1 AND 255
  ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_push_receipts(p_limit integer DEFAULT 100)
RETURNS TABLE(receipt_id text, user_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501'; END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN RAISE EXCEPTION 'Invalid limit'; END IF;
  DELETE FROM public.push_receipt_checks WHERE checked_at < now() - interval '7 days';
  UPDATE public.push_receipt_checks SET checked_at = now(), outcome = 'expired', token_snapshot = ''
    WHERE checked_at IS NULL AND created_at < now() - interval '23 hours'
      AND (claimed_until IS NULL OR claimed_until < now());
  RETURN QUERY WITH due AS (
    SELECT c.receipt_id, c.user_id FROM public.push_receipt_checks c
    WHERE c.checked_at IS NULL AND c.created_at <= now() - interval '15 minutes'
      AND (c.claimed_until IS NULL OR c.claimed_until < now())
    ORDER BY c.created_at LIMIT p_limit FOR UPDATE SKIP LOCKED
  ) UPDATE public.push_receipt_checks c SET claimed_until = now() + interval '5 minutes'
    FROM due WHERE c.receipt_id = due.receipt_id AND c.user_id = due.user_id
    RETURNING c.receipt_id, c.user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_unregistered_push_tokens(p_tokens text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501'; END IF;
  IF p_tokens IS NULL OR cardinality(p_tokens) > 100 THEN RAISE EXCEPTION 'Invalid tokens'; END IF;
  UPDATE public.users SET push_token = NULL WHERE push_token = ANY(p_tokens);
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_push_receipt(p_receipt_id text, p_user_id uuid, p_outcome text, p_error_code text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE saved_token text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501'; END IF;
  IF p_outcome NOT IN ('delivered_to_provider', 'error') OR p_outcome IS NULL OR (p_error_code IS NOT NULL AND p_error_code !~ '^[A-Za-z0-9_]{1,80}$') THEN RAISE EXCEPTION 'Invalid outcome'; END IF;
  SELECT token_snapshot INTO saved_token FROM public.push_receipt_checks
    WHERE receipt_id = p_receipt_id AND user_id = p_user_id AND checked_at IS NULL AND claimed_until > now() FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF p_outcome = 'error' AND p_error_code = 'DeviceNotRegistered' THEN
    UPDATE public.users SET push_token = NULL WHERE id = p_user_id AND push_token = saved_token;
  END IF;
  UPDATE public.push_receipt_checks SET checked_at = now(), outcome = p_outcome,
    error_code = p_error_code, token_snapshot = '', claimed_until = NULL
    WHERE receipt_id = p_receipt_id AND user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_push_receipts(jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_push_receipts(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_push_receipt(text, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.clear_unregistered_push_tokens(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_push_receipts(jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_push_receipts(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_push_receipt(text, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.clear_unregistered_push_tokens(text[]) TO service_role;
