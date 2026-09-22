-- Migration: Add is_hd to stories table
-- Identifies whether a story was uploaded in high-definition (HD) quality

ALTER TABLE public.stories 
ADD COLUMN IF NOT EXISTS is_hd BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_stories_is_hd ON public.stories (is_hd);
