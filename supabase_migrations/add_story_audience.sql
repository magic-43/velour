-- Migration: Add audience privacy to stories table
-- Allows 'all', 'exclude', and 'include' story visibility modes

ALTER TABLE public.stories 
ADD COLUMN IF NOT EXISTS audience_type TEXT DEFAULT 'all' CHECK (audience_type IN ('all', 'exclude', 'include')),
ADD COLUMN IF NOT EXISTS audience_user_ids UUID[] DEFAULT '{}';

-- Index to optimize querying stories by audience
CREATE INDEX IF NOT EXISTS idx_stories_audience ON public.stories (audience_type);
