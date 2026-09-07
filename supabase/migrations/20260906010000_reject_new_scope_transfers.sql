-- Ticket 01's transfer freeze was superseded by ADR-0004 ticket 13.
--
-- This migration version is retained so a clean local chain can pass the
-- historical version without source introspection against a function body
-- that later tickets have replaced. The additive 06040000 migration owns the
-- live contract and replaces the freeze with exact full-settlement checks.
-- Existing Dev installations that already recorded this version retain their
-- historical rows; applying 06040000 supersedes the old function behavior.

DO $$
BEGIN
  IF to_regprocedure('public.commit_settlement_operation(uuid,uuid,uuid,text,numeric,text,timestamptz,numeric,jsonb,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'commit_settlement_operation() was not found';
  END IF;
  IF to_regprocedure('public.commit_zero_net_settlement_operation(uuid,uuid,text,timestamptz,numeric,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'commit_zero_net_settlement_operation() was not found';
  END IF;
END;
$$;
