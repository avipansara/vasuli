-- Run after the feedback migration on a disposable local database.
BEGIN;
DO $$
DECLARE i integer; wakeup uuid := gen_random_uuid();
BEGIN
  IF has_table_privilege('anon', 'public.feedback_submissions', 'SELECT') OR
     has_table_privilege('authenticated', 'public.feedback_submissions', 'SELECT') OR
     has_table_privilege('authenticated', 'public.feedback_submissions', 'INSERT') OR
     has_function_privilege('authenticated', 'public.reserve_feedback_submission(uuid)', 'EXECUTE') OR
     has_function_privilege('authenticated', 'public.consume_feedback_worker_wakeup(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Feedback is accessible to untrusted users';
  END IF;
  FOR i IN 1..10 LOOP
    IF NOT public.reserve_feedback_submission('17c3b003-67cc-4825-bd72-ef4f47f7479c') THEN RAISE EXCEPTION 'Valid submission was rate limited'; END IF;
  END LOOP;
  IF public.reserve_feedback_submission('17c3b003-67cc-4825-bd72-ef4f47f7479c') THEN RAISE EXCEPTION 'Rate limit was not enforced'; END IF;
  INSERT INTO private.feedback_worker_wakeups(id) VALUES (wakeup);
  IF NOT public.consume_feedback_worker_wakeup(wakeup) OR public.consume_feedback_worker_wakeup(wakeup) THEN RAISE EXCEPTION 'Wake-up was not single-use'; END IF;
  INSERT INTO public.feedback_submissions(id, category, message, platform, app_version, screenshot_base64, screenshot_type, created_at)
  VALUES ('9fdb8330-0830-435a-9ac4-a5666d48d032', 'problem', 'test', 'ios', '1', 'iVBORw0KGgo=', 'image/png', now() - interval '1 year 1 day');
  DELETE FROM public.feedback_submissions WHERE created_at < now() - interval '1 year';
  IF EXISTS (SELECT 1 FROM public.feedback_submissions WHERE id = '9fdb8330-0830-435a-9ac4-a5666d48d032') THEN RAISE EXCEPTION 'Expired feedback was not deleted'; END IF;
END $$;
ROLLBACK;
