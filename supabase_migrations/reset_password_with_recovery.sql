-- =============================================================================
-- Velour v2 — Self-serve password reset via verified recovery email
-- Run this in your Supabase SQL Editor
-- =============================================================================

create extension if not exists pgcrypto;

create or replace function public.reset_user_password(
  p_username text,
  p_recovery_email text,
  p_new_password text
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
  v_profile_email text;
begin
  -- 1. Validate username and recovery email on file
  select id, email into v_user_id, v_profile_email
  from public.profiles
  where lower(username) = lower(trim(p_username));

  if v_user_id is null then
    raise exception 'Account not found';
  end if;

  if v_profile_email is null or lower(trim(v_profile_email)) != lower(trim(p_recovery_email)) then
    raise exception 'Recovery email does not match records';
  end if;

  if length(p_new_password) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;

  -- 2. Update auth.users encrypted password with bcrypt hash
  update auth.users
  set encrypted_password = crypt(p_new_password, gen_salt('bf')),
      updated_at = now()
  where id = v_user_id;

  return true;
end;
$$;

-- Grant execution to anon and authenticated roles
grant execute on function public.reset_user_password(text, text, text) to anon, authenticated;
