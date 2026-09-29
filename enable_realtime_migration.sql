-- =============================================================================
-- Velour v2 — Enable Supabase Realtime on chat tables
-- Run this ONCE in: Supabase Dashboard → SQL Editor → New Query
-- =============================================================================

-- Step 1: Enable REPLICA IDENTITY FULL so Postgres includes the full row
--         in change events (required for Supabase Realtime postgres_changes)
ALTER TABLE public.messages       REPLICA IDENTITY FULL;
ALTER TABLE public.conversations  REPLICA IDENTITY FULL;

-- Step 2: Add both tables to the supabase_realtime publication
--         Without this, no realtime events are broadcast — ever.
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
