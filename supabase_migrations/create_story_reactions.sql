-- Migration: create_story_reactions.sql
-- Description: Creates the story_reactions table with strict creator-only view RLS,
-- grants authenticated users permissions (including update for upsert),
-- and creates an atomic security-definer increment_story_view function.

create table if not exists public.story_reactions (
  id              uuid primary key default gen_random_uuid(),
  story_id        uuid not null references public.stories(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  reaction_type   text not null default 'love',
  created_at      timestamptz not null default now(),
  unique (story_id, user_id, reaction_type)
);

comment on table public.story_reactions is 'Viewer reactions on stories (love, bookmark, etc.). Strictly visible only to the creator of the story and the user who reacted.';

-- Indexes for performance
create index if not exists idx_story_reactions_story_id on public.story_reactions(story_id);
create index if not exists idx_story_reactions_user_story on public.story_reactions(user_id, story_id);

-- Enable Row Level Security (RLS)
alter table public.story_reactions enable row level security;

-- Grants: authenticated users need select, insert, update (for upsert support), and delete
grant select, insert, update, delete on public.story_reactions to authenticated;

-- SELECT policy: ONLY the story creator can view all reactions on their story,
-- while reacting users can view only their own reactions (to know their own like/bookmark state).
drop policy if exists "Only story creator can view story reactions" on public.story_reactions;
drop policy if exists "Story creator and reacting user only can view reactions" on public.story_reactions;
create policy "Story creator and reacting user only can view reactions"
  on public.story_reactions for select
  to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1
      from public.stories s
      join public.creator_profiles cp on cp.id = s.creator_profile_id
      where s.id = story_reactions.story_id
        and cp.owner_id = auth.uid()
    )
  );

-- INSERT policy: Authenticated users can insert their own story reactions
drop policy if exists "Users can insert their own story reactions" on public.story_reactions;
create policy "Users can insert their own story reactions"
  on public.story_reactions for insert
  to authenticated
  with check (auth.uid() = user_id);

-- UPDATE policy: Authenticated users can update their own story reactions (needed for upsert)
drop policy if exists "Users can update their own story reactions" on public.story_reactions;
create policy "Users can update their own story reactions"
  on public.story_reactions for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- DELETE policy: Users can remove their own reactions
drop policy if exists "Users can delete their own story reactions" on public.story_reactions;
create policy "Users can delete their own story reactions"
  on public.story_reactions for delete
  to authenticated
  using (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- Function to safely and atomically increment story views across viewers
-- Bypasses creator-only UPDATE RLS on public.stories with security definer
-- -----------------------------------------------------------------------------
create or replace function public.increment_story_view(p_story_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.stories
  set view_count = coalesce(view_count, 0) + 1
  where id = p_story_id;
end;
$$;

grant execute on function public.increment_story_view(uuid) to anon, authenticated;
