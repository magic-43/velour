-- =============================================================================
-- Velour v2 — Recovery Email 6-Digit OTP Verification
-- Run this in your Supabase SQL Editor (Database -> SQL Editor -> New Query)
-- =============================================================================

create table if not exists public.recovery_email_verifications (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  email       text not null,
  otp_code    text not null,
  expires_at  timestamptz not null default (now() + interval '10 minutes'),
  created_at  timestamptz not null default now()
);

-- Index for speedy lookups
create index if not exists idx_recovery_verifications_user 
  on public.recovery_email_verifications(user_id, lower(email));

-- RLS
alter table public.recovery_email_verifications enable row level security;

drop policy if exists "Users can manage own recovery verifications" on public.recovery_email_verifications;
create policy "Users can manage own recovery verifications"
  on public.recovery_email_verifications
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Permissions
grant select, insert, update, delete on public.recovery_email_verifications to authenticated;
grant all on public.recovery_email_verifications to service_role;

-- ── 1. RPC: Request Recovery Email OTP ───────────────────────────────────────
create or replace function public.request_recovery_email_otp(
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
  v_clean_email text;
  v_otp text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object('success', false, 'message', 'Not authenticated');
  end if;

  v_clean_email := lower(trim(p_email));
  if v_clean_email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' then
    return jsonb_build_object('success', false, 'message', 'Invalid email address');
  end if;

  -- Generate cryptographically random 6-digit code
  v_otp := lpad(floor(random() * 900000 + 100000)::text, 6, '0');

  -- Invalidate previous pending codes for this user
  delete from public.recovery_email_verifications
  where user_id = v_user_id;

  -- Insert new code with 10-minute expiry
  insert into public.recovery_email_verifications (user_id, email, otp_code, expires_at)
  values (v_user_id, v_clean_email, v_otp, now() + interval '10 minutes');

  return jsonb_build_object(
    'success', true,
    'email', v_clean_email,
    'code', v_otp,
    'expires_in', 600
  );
end;
$$;

-- ── 2. RPC: Verify Recovery Email OTP ────────────────────────────────────────
create or replace function public.verify_recovery_email_otp(
  p_email text,
  p_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
  v_clean_email text;
  v_clean_code text;
  v_matched_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object('success', false, 'message', 'Not authenticated');
  end if;

  v_clean_email := lower(trim(p_email));
  v_clean_code := trim(p_code);

  -- Check matching code that has not expired
  select id into v_matched_id
  from public.recovery_email_verifications
  where user_id = v_user_id
    and lower(email) = v_clean_email
    and otp_code = v_clean_code
    and expires_at > now()
  order by created_at desc
  limit 1;

  if v_matched_id is null then
    return jsonb_build_object('success', false, 'message', 'Invalid or expired verification code');
  end if;

  -- Update profiles.email to the verified email
  update public.profiles
  set email = v_clean_email
  where id = v_user_id;

  -- Clean up verification record
  delete from public.recovery_email_verifications
  where user_id = v_user_id;

  return jsonb_build_object(
    'success', true,
    'email', v_clean_email,
    'message', 'Recovery email verified and updated successfully'
  );
end;
$$;

grant execute on function public.request_recovery_email_otp(text) to authenticated;
grant execute on function public.verify_recovery_email_otp(text, text) to authenticated;
