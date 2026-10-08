-- =============================================================================
-- Velour v2 — Follows Table Migration
-- Run this in Supabase SQL Editor (Database → SQL Editor → New Query)
-- =============================================================================

create table if not exists public.follows (
  id                  uuid primary key default uuid_generate_v4(),
  fan_id              uuid not null references public.profiles(id) on delete cascade,
  creator_profile_id  uuid not null references public.creator_profiles(id) on delete cascade,
  created_at          timestamptz not null default now(),
  unique (fan_id, creator_profile_id)
);

comment on table public.follows is 'Tracks fans following creator profiles.';

-- Indexes for high-throughput counting & lookups
create index if not exists idx_follows_fan_id on public.follows(fan_id);
create index if not exists idx_follows_creator_profile_id on public.follows(creator_profile_id);

-- Enable RLS
alter table public.follows enable row level security;

-- Policies
create policy "Anyone can read follows"
  on public.follows for select
  using (true);

create policy "Authenticated fans can follow"
  on public.follows for insert
  to authenticated
  with check (fan_id = auth.uid());

create policy "Fans can unfollow"
  on public.follows for delete
  to authenticated
  using (fan_id = auth.uid());

-- Enable Realtime
alter publication supabase_realtime add table public.follows;
