-- Run after migrations on a disposable local database. All fixtures roll back.
BEGIN;
SET LOCAL request.jwt.claim.role = 'service_role';
INSERT INTO public.users (id, name, email, push_token) VALUES
  ('af100000-0000-0000-0000-000000000001', 'Receipt test', 'push-receipt@example.test', 'old-token');
SELECT public.record_push_receipts('[{"receipt_id":"old-receipt","token":"old-token"},{"receipt_id":"new-receipt","token":"old-token"}]', 'expense_added');
UPDATE public.push_receipt_checks SET created_at = now() - interval '16 minutes';
DO $$ BEGIN
  IF (SELECT count(*) FROM public.claim_push_receipts(10) WHERE user_id = 'af100000-0000-0000-0000-000000000001') <> 2 THEN RAISE EXCEPTION 'Expected two claims'; END IF;
  UPDATE public.users SET push_token = 'new-token' WHERE id = 'af100000-0000-0000-0000-000000000001';
  PERFORM public.finish_push_receipt('old-receipt', 'af100000-0000-0000-0000-000000000001', 'error', 'DeviceNotRegistered');
  IF (SELECT push_token FROM public.users WHERE id = 'af100000-0000-0000-0000-000000000001') <> 'new-token' THEN RAISE EXCEPTION 'New token was removed'; END IF;
  UPDATE public.users SET push_token = 'old-token' WHERE id = 'af100000-0000-0000-0000-000000000001';
  PERFORM public.finish_push_receipt('new-receipt', 'af100000-0000-0000-0000-000000000001', 'error', 'DeviceNotRegistered');
  IF (SELECT push_token FROM public.users WHERE id = 'af100000-0000-0000-0000-000000000001') IS NOT NULL THEN RAISE EXCEPTION 'Invalid token was not cleared'; END IF;
END $$;
SET LOCAL request.jwt.claim.role = 'authenticated';
DO $$ BEGIN
  BEGIN
    PERFORM public.claim_push_receipts(10);
    RAISE EXCEPTION 'Untrusted caller could claim receipts';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
