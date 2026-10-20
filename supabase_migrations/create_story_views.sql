-- ==============================================================================
-- Migration: Create story_views Table
-- Description: Tracks which users have viewed which stories to persist watched
--              state across devices and enable creator view counts / viewer lists.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.story_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
    viewer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    viewed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT story_views_unique_view UNIQUE (story_id, viewer_id)
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_story_views_viewer ON public.story_views(viewer_id);
CREATE INDEX IF NOT EXISTS idx_story_views_story ON public.story_views(story_id);

-- Grants: Supabase PostgREST requires table access granted to authenticated & anon roles
GRANT SELECT, INSERT, UPDATE, DELETE ON public.story_views TO authenticated;
GRANT SELECT ON public.story_views TO anon;

-- Enable Row Level Security
ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;

-- 1. Viewers can query their own views (used by useStories to mark stories as viewed)
DROP POLICY IF EXISTS "Users can read own story views" ON public.story_views;
CREATE POLICY "Users can read own story views"
    ON public.story_views
    FOR SELECT
    USING (auth.uid() = viewer_id);

-- 2. Story creators can inspect who viewed their stories
DROP POLICY IF EXISTS "Creators can view who watched their stories" ON public.story_views;
CREATE POLICY "Creators can view who watched their stories"
    ON public.story_views
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.stories s
            JOIN public.creator_profiles cp ON s.creator_profile_id = cp.id
            WHERE s.id = story_views.story_id AND cp.owner_id = auth.uid()
        )
    );

-- 3. Authenticated users can record their view
DROP POLICY IF EXISTS "Users can insert own story views" ON public.story_views;
CREATE POLICY "Users can insert own story views"
    ON public.story_views
    FOR INSERT
    WITH CHECK (auth.uid() = viewer_id);
