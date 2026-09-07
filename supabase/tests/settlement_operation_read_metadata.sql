-- Deterministic authenticated read-contract checks. All fixtures roll back.
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/settlement_operation_read_metadata.sql
BEGIN;
CREATE TEMP TABLE _metadata_fixture_ids (actor uuid, friend uuid, observer uuid, outsider uuid, group_id uuid, op_friend uuid, op_group_cash uuid, op_group_adjustment uuid) ON COMMIT DROP;
INSERT INTO _metadata_fixture_ids VALUES ('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000003');
INSERT INTO auth.users (id, aud, role, email, created_at, updated_at, is_sso_user, is_anonymous)
SELECT actor,'authenticated','authenticated','metadata-actor@example.invalid','2026-01-01'::timestamptz,'2026-01-01'::timestamptz,false,false FROM _metadata_fixture_ids
UNION ALL SELECT friend,'authenticated','authenticated','metadata-friend@example.invalid','2026-01-01'::timestamptz,'2026-01-01'::timestamptz,false,false FROM _metadata_fixture_ids
UNION ALL SELECT observer,'authenticated','authenticated','metadata-observer@example.invalid','2026-01-01'::timestamptz,'2026-01-01'::timestamptz,false,false FROM _metadata_fixture_ids
UNION ALL SELECT outsider,'authenticated','authenticated','metadata-outsider@example.invalid','2026-01-01'::timestamptz,'2026-01-01'::timestamptz,false,false FROM _metadata_fixture_ids;
INSERT INTO public.users (id,name,auth_user_id,created_at) SELECT actor,'Metadata actor',actor,'2026-01-01'::timestamptz FROM _metadata_fixture_ids UNION ALL SELECT friend,'Metadata friend',friend,'2026-01-01'::timestamptz FROM _metadata_fixture_ids UNION ALL SELECT observer,'Metadata observer',observer,'2026-01-01'::timestamptz FROM _metadata_fixture_ids UNION ALL SELECT outsider,'Metadata outsider',outsider,'2026-01-01'::timestamptz FROM _metadata_fixture_ids;
INSERT INTO public.friendships (id,user_id,friend_id,status,created_at) SELECT '40000000-0000-0000-0000-000000000001'::uuid,actor,friend,'accepted','2026-01-01'::timestamptz FROM _metadata_fixture_ids;
INSERT INTO public.groups (id,name,created_at,updated_at) SELECT group_id,'Metadata group','2026-01-01'::timestamptz,'2026-01-01'::timestamptz FROM _metadata_fixture_ids;
INSERT INTO public.group_members (id,group_id,user_id,role,joined_at) SELECT '50000000-0000-0000-0000-000000000001'::uuid,group_id,actor,'admin','2026-01-01'::timestamptz FROM _metadata_fixture_ids UNION ALL SELECT '50000000-0000-0000-0000-000000000002'::uuid,group_id,friend,'member','2026-01-01'::timestamptz FROM _metadata_fixture_ids UNION ALL SELECT '50000000-0000-0000-0000-000000000003'::uuid,group_id,observer,'member','2026-01-01'::timestamptz FROM _metadata_fixture_ids;
INSERT INTO public.settlement_operations (id,actor_user_id,friend_user_id,mode,currency,expected_balance,requested_payment_amount,payment_intent_id,status,created_at,reversed_at) SELECT op_friend,actor,friend,'all_balances','USD',-7,7,'60000000-0000-0000-0000-000000000001'::uuid,'reversed','2026-08-01 10:00Z','2026-09-02 10:00Z' FROM _metadata_fixture_ids;
INSERT INTO public.settlement_operations (id,actor_user_id,friend_user_id,mode,currency,expected_balance,requested_payment_amount,payment_intent_id,status,created_at) SELECT op_group_cash,actor,friend,'all_balances','USD',8,99,'60000000-0000-0000-0000-000000000002'::uuid,'committed','2026-08-10 10:00Z' FROM _metadata_fixture_ids;
INSERT INTO public.settlement_operations (id,actor_user_id,friend_user_id,group_id,mode,currency,expected_balance,requested_payment_amount,payment_intent_id,status,created_at) SELECT op_group_adjustment,actor,friend,group_id,'group','USD',0,0,'60000000-0000-0000-0000-000000000003'::uuid,'committed','2026-08-11 10:00Z' FROM _metadata_fixture_ids;
-- Source transfer rows precede their FK-linked converted settlements.
SET LOCAL session_replication_role = replica;
INSERT INTO public.settlement_scope_transfers (id,operation_id,group_id,from_user_id,to_user_id,currency,signed_group_balance_delta,created_at,is_reversal)
SELECT '80000000-0000-0000-0000-000000000004'::uuid,op_group_cash,group_id,actor,friend,'USD',99,'2026-07-10 09:00Z'::timestamptz,false FROM _metadata_fixture_ids
UNION ALL SELECT '80000000-0000-0000-0000-000000000005'::uuid,op_friend,group_id,actor,friend,'USD',99,'2026-07-01 08:00Z'::timestamptz,false FROM _metadata_fixture_ids;
SET LOCAL session_replication_role = origin;
INSERT INTO public.settlements (id,from_user_id,to_user_id,amount,currency,date,created_at,operation_id,backfilled_transfer_id)
SELECT '70000000-0000-0000-0000-000000000001'::uuid,friend,actor,7,'USD','2026-08-01 09:00Z'::timestamptz,'2026-08-01 09:00Z'::timestamptz,op_friend,NULL::uuid FROM _metadata_fixture_ids
UNION ALL SELECT '70000000-0000-0000-0000-000000000002'::uuid,actor,friend,7,'USD','2026-09-02 10:01Z'::timestamptz,'2026-09-02 10:01Z'::timestamptz,op_friend,NULL::uuid FROM _metadata_fixture_ids
UNION ALL SELECT '70000000-0000-0000-0000-000000000005'::uuid,actor,friend,99,'USD','2026-07-01 08:00Z'::timestamptz,'2026-07-01 08:00Z'::timestamptz,op_friend,'80000000-0000-0000-0000-000000000005'::uuid FROM _metadata_fixture_ids;
INSERT INTO public.settlements (id,group_id,from_user_id,to_user_id,amount,currency,date,created_at,operation_id,backfilled_transfer_id)
SELECT '70000000-0000-0000-0000-000000000003'::uuid,group_id,friend,actor,8,'USD','2026-08-10 09:00Z'::timestamptz,'2026-08-10 09:00Z'::timestamptz,op_group_cash,NULL::uuid FROM _metadata_fixture_ids
UNION ALL SELECT '70000000-0000-0000-0000-000000000004'::uuid,group_id,actor,friend,99,'USD','2026-07-10 09:00Z'::timestamptz,'2026-07-10 09:00Z'::timestamptz,op_group_cash,'80000000-0000-0000-0000-000000000004'::uuid FROM _metadata_fixture_ids;
-- These are read fixtures; bypass the accounting validation trigger while the
-- transaction is open so the RPC's visibility/shape contract is isolated.
SET LOCAL session_replication_role = replica;
INSERT INTO public.settlement_scope_transfers (id,operation_id,group_id,from_user_id,to_user_id,currency,signed_group_balance_delta,created_at,is_reversal) SELECT '80000000-0000-0000-0000-000000000001'::uuid,op_group_adjustment,group_id,friend,actor,'USD',-3,'2026-08-11 10:01Z'::timestamptz,false FROM _metadata_fixture_ids;
SET LOCAL session_replication_role = origin;
GRANT SELECT ON _metadata_fixture_ids TO authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',json_build_object('sub',actor::text,'role','authenticated')::text,true) FROM _metadata_fixture_ids;
DO $$ DECLARE f _metadata_fixture_ids%ROWTYPE; r record; n integer; BEGIN
 SELECT * INTO f FROM _metadata_fixture_ids;
 SELECT count(*) INTO n FROM public.get_friend_settlement_operations(f.friend); IF n <> 3 THEN RAISE EXCEPTION 'expected 3 Friend operations, got %',n; END IF;
 SELECT * INTO STRICT r FROM public.get_friend_settlement_operations(f.friend) WHERE operation_id=f.op_friend;
 IF r.status IS DISTINCT FROM 'reversed' OR r.requested_payment_amount IS DISTINCT FROM 7 OR r.original_date IS DISTINCT FROM '2026-08-01 09:00Z'::timestamptz OR r.original_from_user_id IS DISTINCT FROM f.friend OR r.original_to_user_id IS DISTINCT FROM f.actor THEN RAISE EXCEPTION 'Friend metadata amount/direction/date failed'; END IF;
 SELECT count(*) INTO n FROM public.get_group_settlement_operations(f.group_id); IF n <> 3 THEN RAISE EXCEPTION 'expected 3 Group operations, got %',n; END IF;
 SELECT * INTO STRICT r FROM public.get_group_settlement_operations(f.group_id) WHERE operation_id=f.op_group_cash; IF r.local_payment_amount IS DISTINCT FROM 8 OR r.local_payment_amount=99 OR r.local_date IS DISTINCT FROM '2026-08-10 09:00Z'::timestamptz OR r.local_from_user_id IS DISTINCT FROM f.friend OR r.local_to_user_id IS DISTINCT FROM f.actor THEN RAISE EXCEPTION 'Group local cash/privacy failed'; END IF;
 SELECT * INTO STRICT r FROM public.get_group_settlement_operations(f.group_id) WHERE operation_id=f.op_group_adjustment; IF r.local_payment_amount IS DISTINCT FROM 0 OR r.local_from_user_id IS DISTINCT FROM f.friend OR r.local_to_user_id IS DISTINCT FROM f.actor THEN RAISE EXCEPTION 'Group adjustment participants failed'; END IF;
 SELECT * INTO STRICT r FROM public.get_group_settlement_operations(f.group_id) WHERE operation_id=f.op_friend; IF r.local_payment_amount IS DISTINCT FROM 0 OR r.local_date IS DISTINCT FROM '2026-08-01 10:00Z'::timestamptz THEN RAISE EXCEPTION 'marked Friend cash leaked into Group metadata'; END IF;
END $$;
SELECT set_config('request.jwt.claims',json_build_object('sub',observer::text,'role','authenticated')::text,true) FROM _metadata_fixture_ids;
DO $$ DECLARE f _metadata_fixture_ids%ROWTYPE; r record; BEGIN SELECT * INTO f FROM _metadata_fixture_ids; IF EXISTS (SELECT 1 FROM public.get_friend_settlement_operations(f.friend)) THEN RAISE EXCEPTION 'group observer received Friend metadata'; END IF; SELECT * INTO STRICT r FROM public.get_group_settlement_operations(f.group_id) WHERE operation_id=f.op_group_cash; IF r.local_payment_amount IS DISTINCT FROM 8 OR r.local_payment_amount=99 THEN RAISE EXCEPTION 'group observer privacy failed'; END IF; END $$;
SELECT set_config('request.jwt.claims',json_build_object('sub',outsider::text,'role','authenticated')::text,true) FROM _metadata_fixture_ids;
DO $$ DECLARE f _metadata_fixture_ids%ROWTYPE; BEGIN SELECT * INTO f FROM _metadata_fixture_ids; IF EXISTS (SELECT 1 FROM public.get_friend_settlement_operations(f.friend)) OR EXISTS (SELECT 1 FROM public.get_group_settlement_operations(f.group_id)) THEN RAISE EXCEPTION 'nonparticipant received metadata'; END IF; END $$;
ROLLBACK;
