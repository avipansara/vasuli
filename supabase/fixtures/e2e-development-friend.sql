-- Development E2E fixture only.
-- Run this in the development Supabase SQL editor before settlements.test.js.
-- Do not run against production.
-- Replace the two placeholder emails below with local development account emails
-- before running. Keep the populated SQL file out of source control.

DO $$
DECLARE
  v_reviewer_id uuid;
  v_friend_id uuid;
  reviewer_count integer;
  friend_count integer;
BEGIN
  SELECT count(*)
    INTO reviewer_count
  FROM public.users
  WHERE lower(btrim(email)) = 'REPLACE_WITH_REVIEWER_EMAIL';

  SELECT count(*)
    INTO friend_count
  FROM public.users
  WHERE lower(btrim(email)) = 'REPLACE_WITH_E2E_FRIEND_EMAIL';

  IF reviewer_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one reviewer profile, found %', reviewer_count;
  END IF;

  IF friend_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one E2E friend profile, found %', friend_count;
  END IF;

  SELECT id INTO v_reviewer_id
  FROM public.users
  WHERE lower(btrim(email)) = 'REPLACE_WITH_REVIEWER_EMAIL';

  SELECT id INTO v_friend_id
  FROM public.users
  WHERE lower(btrim(email)) = 'REPLACE_WITH_E2E_FRIEND_EMAIL';

  IF v_reviewer_id = v_friend_id THEN
    RAISE EXCEPTION 'Reviewer and E2E friend profiles must be different users';
  END IF;

  INSERT INTO public.friendships (user_id, friend_id, status)
  VALUES (v_reviewer_id, v_friend_id, 'accepted')
  ON CONFLICT (user_id, friend_id)
  DO UPDATE SET status = EXCLUDED.status;
END $$;

SELECT
  u.email AS reviewer_email,
  f.email AS friend_email,
  friendship.status
FROM public.friendships AS friendship
JOIN public.users AS u ON u.id = friendship.user_id
JOIN public.users AS f ON f.id = friendship.friend_id
WHERE lower(btrim(u.email)) = 'REPLACE_WITH_REVIEWER_EMAIL'
  AND lower(btrim(f.email)) = 'REPLACE_WITH_E2E_FRIEND_EMAIL';
