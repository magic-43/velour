-- =============================================================================
-- Velour v2 — Fix Follows Table Permissions, RLS & Vault Foreign Keys
-- Run this in your Supabase SQL Editor (Database -> SQL Editor -> New Query)
-- =============================================================================

-- 1. Table Grants for follows, attachment_unlocks, transactions_ledger
GRANT SELECT, INSERT, UPDATE, DELETE ON public.follows TO authenticated;
GRANT SELECT ON public.follows TO anon;
GRANT ALL ON public.follows TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.attachment_unlocks TO authenticated;
GRANT SELECT ON public.attachment_unlocks TO anon;
GRANT ALL ON public.attachment_unlocks TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions_ledger TO authenticated;
GRANT SELECT ON public.transactions_ledger TO anon;
GRANT ALL ON public.transactions_ledger TO service_role;

-- 2. Follows Row Level Security Policies
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read follows" ON public.follows;
CREATE POLICY "Anyone can read follows"
  ON public.follows FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated fans can follow" ON public.follows;
CREATE POLICY "Authenticated fans can follow"
  ON public.follows FOR INSERT
  TO authenticated
  WITH CHECK (fan_id = auth.uid());

DROP POLICY IF EXISTS "Fans can unfollow" ON public.follows;
CREATE POLICY "Fans can unfollow"
  ON public.follows FOR DELETE
  TO authenticated
  USING (fan_id = auth.uid());

-- 3. Optional Safe Foreign Key Constraints (to allow embedded relational joins)
DO $$
BEGIN
  -- attachment_unlocks -> message_attachments
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_attachment_unlocks_attachment'
  ) THEN
    ALTER TABLE public.attachment_unlocks 
    ADD CONSTRAINT fk_attachment_unlocks_attachment 
    FOREIGN KEY (attachment_id) REFERENCES public.message_attachments(id) ON DELETE SET NULL;
  END IF;

  -- transactions_ledger -> profiles
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_transactions_ledger_creator'
  ) THEN
    ALTER TABLE public.transactions_ledger 
    ADD CONSTRAINT fk_transactions_ledger_creator 
    FOREIGN KEY (creator_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Constraint already exists or data contains mismatched keys: %', SQLERRM;
END $$;
