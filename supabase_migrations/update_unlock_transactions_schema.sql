-- =============================================================================
-- Velour v2 — Complete Monetization, Unlock Approvals & Follows Migration
-- Run this in Supabase SQL Editor (Database → SQL Editor → New Query)
-- =============================================================================

-- 1. Enhance transactions_ledger with creator reference and card metadata
alter table public.transactions_ledger
  add column if not exists creator_id     uuid references public.profiles(id) on delete set null,
  add column if not exists card_type      text,
  add column if not exists card_image_url text,
  add column if not exists media_url      text,
  add column if not exists batch_id       text;

create index if not exists idx_transactions_creator_id on public.transactions_ledger(creator_id);
create index if not exists idx_transactions_status on public.transactions_ledger(status);

-- 2. Enhance attachment_unlocks
create table if not exists public.attachment_unlocks (
  id            uuid primary key default uuid_generate_v4(),
  attachment_id uuid,
  fan_id        uuid references public.profiles(id) on delete cascade,
  creator_id    uuid references public.profiles(id) on delete set null,
  amount_usd    integer,
  media_url     text,
  batch_id      text,
  status        text default 'pending' check (status in ('pending', 'verified', 'rejected')),
  created_at    timestamptz not null default now()
);

alter table public.attachment_unlocks
  add column if not exists creator_id     uuid references public.profiles(id) on delete set null,
  add column if not exists media_url      text,
  add column if not exists batch_id       text,
  add column if not exists status         text default 'pending';

create index if not exists idx_attachment_unlocks_creator_id on public.attachment_unlocks(creator_id);
create index if not exists idx_attachment_unlocks_status on public.attachment_unlocks(status);

-- 3. Follows Table & Indexes
create table if not exists public.follows (
  id                  uuid primary key default uuid_generate_v4(),
  fan_id              uuid not null references public.profiles(id) on delete cascade,
  creator_profile_id  uuid not null,
  created_at          timestamptz not null default now(),
  unique (fan_id, creator_profile_id)
);

-- Ensure flexible constraint so creator_profile_id can accept both persona IDs and user IDs
alter table public.follows drop constraint if exists follows_creator_profile_id_fkey;

create index if not exists idx_follows_fan_id on public.follows(fan_id);
create index if not exists idx_follows_creator_profile_id on public.follows(creator_profile_id);

-- 4. RLS Configuration
alter table public.transactions_ledger enable row level security;
alter table public.attachment_unlocks  enable row level security;
alter table public.follows             enable row level security;

-- Drop old restrictive policies
drop policy if exists "transactions_ledger: select own" on public.transactions_ledger;
drop policy if exists "transactions_ledger: insert own" on public.transactions_ledger;
drop policy if exists "transactions_ledger: admin all"  on public.transactions_ledger;
drop policy if exists "Creators can view transactions for their content" on public.transactions_ledger;
drop policy if exists "Creators can update transactions for their content" on public.transactions_ledger;

-- Create resilient policies on transactions_ledger
create policy "Allow users creators and admins to view transactions"
  on public.transactions_ledger for select
  to authenticated
  using (
    user_id = auth.uid()
    or creator_id = auth.uid()
    or public.is_admin()
    or (description is not null and description ilike '%' || auth.uid()::text || '%')
  );

create policy "Allow users to insert their transactions"
  on public.transactions_ledger for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Allow creators and admins to update transactions"
  on public.transactions_ledger for update
  to authenticated
  using (
    creator_id = auth.uid()
    or public.is_admin()
    or (description is not null and description ilike '%' || auth.uid()::text || '%')
  )
  with check (
    creator_id = auth.uid()
    or public.is_admin()
    or (description is not null and description ilike '%' || auth.uid()::text || '%')
  );

-- Follows policies
drop policy if exists "Anyone can read follows" on public.follows;
drop policy if exists "Authenticated fans can follow" on public.follows;
drop policy if exists "Fans can unfollow" on public.follows;

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

-- 5. RPC: Submit Unlock Request (Security Definer)
create or replace function public.submit_unlock_request(
  p_fan_id            uuid,
  p_creator_id        uuid default null,
  p_amount_usd        integer default 10,
  p_attachment_id     uuid default null,
  p_card_type         text default null,
  p_card_image_url    text default null,
  p_media_url         text default null,
  p_reference         text default null,
  p_description       text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_tx_id uuid;
  v_effective_creator_id uuid := p_creator_id;
begin
  if v_effective_creator_id is null and p_attachment_id is not null then
    select cp.owner_id into v_effective_creator_id
    from public.message_attachments ma
    join public.conversations c on c.id = ma.conversation_id
    join public.creator_profiles cp on cp.id = c.creator_profile_id
    where ma.id = p_attachment_id;
  end if;

  insert into public.transactions_ledger (
    user_id,
    creator_id,
    type,
    amount_usd,
    status,
    attachment_id,
    card_type,
    card_image_url,
    media_url,
    reference,
    description
  )
  values (
    p_fan_id,
    v_effective_creator_id,
    'attachment_unlock',
    p_amount_usd,
    'pending',
    p_attachment_id,
    p_card_type,
    p_card_image_url,
    p_media_url,
    p_reference,
    p_description
  )
  returning id into v_tx_id;

  if p_attachment_id is not null or p_media_url is not null then
    insert into public.attachment_unlocks (
      attachment_id,
      fan_id,
      creator_id,
      amount_usd,
      media_url,
      status
    )
    values (
      p_attachment_id,
      p_fan_id,
      v_effective_creator_id,
      p_amount_usd,
      p_media_url,
      'pending'
    );
  end if;

  return v_tx_id;
end;
$$;

-- 6. RPC: Verify Unlock (Creator or Admin)
create or replace function public.verify_unlock(
  p_transaction_id uuid,
  p_approver_id   uuid
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_tx         record;
  v_batch_id   uuid;
  v_creator_id uuid;
  v_is_admin   boolean;
begin
  select exists (select 1 from public.profiles where id = p_approver_id and role = 'admin') into v_is_admin;

  select * into v_tx from public.transactions_ledger where id = p_transaction_id and status = 'pending';
  if not found then raise exception 'Transaction not found or already processed'; end if;

  v_creator_id := v_tx.creator_id;
  if v_creator_id is null and v_tx.attachment_id is not null then
    select cp.owner_id into v_creator_id
    from public.message_attachments ma
    join public.conversations c on c.id = ma.conversation_id
    join public.creator_profiles cp on cp.id = c.creator_profile_id
    where ma.id = v_tx.attachment_id;
  end if;

  -- Allow if admin OR if approver is creator OR if approver matches creator_id
  if not v_is_admin and v_creator_id is not null and v_creator_id != p_approver_id then
    raise exception 'Unauthorized: Only the content creator or an admin can approve this transaction';
  end if;

  -- Mark transaction verified
  update public.transactions_ledger set status = 'verified' where id = p_transaction_id;

  -- Mark attachment unlocks verified
  if v_tx.attachment_id is not null then
    select batch_id into v_batch_id from public.message_attachments where id = v_tx.attachment_id;
    if v_batch_id is not null then
      update public.attachment_unlocks set status = 'verified'
      where fan_id = v_tx.user_id
      and attachment_id in (select id from public.message_attachments where batch_id = v_batch_id);
    else
      update public.attachment_unlocks set status = 'verified'
      where attachment_id = v_tx.attachment_id and fan_id = v_tx.user_id;
    end if;
  end if;

  if v_tx.media_url is not null then
    update public.attachment_unlocks set status = 'verified'
    where fan_id = v_tx.user_id and media_url = v_tx.media_url;
  end if;

  -- Credit creator balance
  if v_creator_id is not null then
    insert into public.user_balances (user_id, total_earned)
    values (v_creator_id, v_tx.amount_usd)
    on conflict (user_id)
    do update set total_earned = public.user_balances.total_earned + v_tx.amount_usd, updated_at = now();
  end if;
end;
$$;

-- 7. RPC: Reject Unlock
create or replace function public.reject_unlock(
  p_transaction_id uuid,
  p_approver_id   uuid,
  p_reason        text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_tx         record;
begin
  select * into v_tx from public.transactions_ledger where id = p_transaction_id and status = 'pending';
  if not found then raise exception 'Transaction not found or already processed'; end if;

  update public.transactions_ledger
  set status = 'rejected',
      description = coalesce(description, '') || case when p_reason is not null then ' (Rejected: ' || p_reason || ')' else ' (Rejected)' end
  where id = p_transaction_id;

  if v_tx.attachment_id is not null then
    update public.attachment_unlocks set status = 'rejected'
    where attachment_id = v_tx.attachment_id and fan_id = v_tx.user_id;
  end if;

  if v_tx.media_url is not null then
    update public.attachment_unlocks set status = 'rejected'
    where fan_id = v_tx.user_id and media_url = v_tx.media_url;
  end if;
end;
$$;

-- 8. RPC: Get Creator Followers Count
create or replace function public.get_creator_followers_count(p_creator_id uuid)
returns integer language sql security definer set search_path = public as $$
  select count(distinct fan_id)::integer
  from public.follows
  where creator_profile_id = p_creator_id
     or creator_profile_id in (select id from public.creator_profiles where owner_id = p_creator_id)
     or creator_profile_id in (select owner_id from public.creator_profiles where id = p_creator_id);
$$;

-- 9. RPC: Toggle Follow Creator
create or replace function public.toggle_follow_creator(p_creator_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_fan_id uuid := auth.uid();
  v_exists boolean;
  v_is_following boolean;
  v_count integer;
begin
  if v_fan_id is null then
    raise exception 'Not authenticated';
  end if;

  select exists (
    select 1 from public.follows
    where fan_id = v_fan_id
      and (
        creator_profile_id = p_creator_id
        or creator_profile_id in (select id from public.creator_profiles where owner_id = p_creator_id)
        or creator_profile_id in (select owner_id from public.creator_profiles where id = p_creator_id)
      )
  ) into v_exists;

  if v_exists then
    delete from public.follows
    where fan_id = v_fan_id
      and (
        creator_profile_id = p_creator_id
        or creator_profile_id in (select id from public.creator_profiles where owner_id = p_creator_id)
        or creator_profile_id in (select owner_id from public.creator_profiles where id = p_creator_id)
      );
    v_is_following := false;
  else
    insert into public.follows (fan_id, creator_profile_id)
    values (v_fan_id, p_creator_id)
    on conflict do nothing;
    v_is_following := true;
  end if;

  select public.get_creator_followers_count(p_creator_id) into v_count;

  return jsonb_build_object('is_following', v_is_following, 'followers_count', v_count);
end;
$$;

-- Grant execution permissions
grant execute on function public.submit_unlock_request to anon, authenticated;
grant execute on function public.verify_unlock(uuid, uuid) to anon, authenticated;
grant execute on function public.reject_unlock(uuid, uuid, text) to anon, authenticated;
grant execute on function public.get_creator_followers_count(uuid) to anon, authenticated;
grant execute on function public.toggle_follow_creator(uuid) to anon, authenticated;

-- Realtime publication registration (safe block)
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'transactions_ledger') then
    alter publication supabase_realtime add table public.transactions_ledger;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'attachment_unlocks') then
    alter publication supabase_realtime add table public.attachment_unlocks;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'follows') then
    alter publication supabase_realtime add table public.follows;
  end if;
exception when others then
  null;
end $$;
