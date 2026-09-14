-- Per-person passwords: create account sets a password on an existing roster name.
-- Shared demo password "password" no longer works.
-- Run in the Supabase SQL Editor.
--
-- Also keep Email provider enabled:
-- Authentication → Providers → Email → Enable (confirm email can stay off).

create extension if not exists "pgcrypto";

alter table public.roster
  add column if not exists password_set boolean not null default false;

-- Ensure an Auth user (+ email identity) exists for a roster email.
create or replace function public.ensure_roster_auth_user(
  p_email text,
  p_name text,
  p_password text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
set row_security = off
as $$
declare
  uid uuid;
  encrypted text;
begin
  if nullif(trim(coalesce(p_email, '')), '') is null then
    raise exception 'Email is required';
  end if;

  select id into uid from auth.users where lower(email) = lower(trim(p_email));

  if p_password is null or length(p_password) = 0 then
    encrypted := crypt(gen_random_uuid()::text, gen_salt('bf'::text));
  else
    encrypted := crypt(p_password, gen_salt('bf'::text));
  end if;

  if uid is null then
    uid := gen_random_uuid();

    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000',
      uid,
      'authenticated',
      'authenticated',
      lower(trim(p_email)),
      encrypted,
      now(),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      jsonb_build_object('full_name', p_name, 'name', p_name),
      now(),
      now(),
      '',
      '',
      '',
      ''
    );

    insert into auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    ) values (
      gen_random_uuid(),
      uid,
      jsonb_build_object(
        'sub', uid::text,
        'email', lower(trim(p_email)),
        'email_verified', true,
        'full_name', p_name
      ),
      'email',
      uid::text,
      now(),
      now(),
      now()
    );
  else
    update auth.users
    set
      encrypted_password = case
        when p_password is null or length(p_password) = 0 then encrypted_password
        else encrypted
      end,
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      raw_user_meta_data =
        coalesce(raw_user_meta_data, '{}'::jsonb)
        || jsonb_build_object('full_name', p_name, 'name', p_name),
      updated_at = now()
    where id = uid;

    if not exists (
      select 1 from auth.identities
      where user_id = uid and provider = 'email'
    ) then
      insert into auth.identities (
        id,
        user_id,
        identity_data,
        provider,
        provider_id,
        last_sign_in_at,
        created_at,
        updated_at
      ) values (
        gen_random_uuid(),
        uid,
        jsonb_build_object(
          'sub', uid::text,
          'email', lower(trim(p_email)),
          'email_verified', true,
          'full_name', p_name
        ),
        'email',
        uid::text,
        now(),
        now(),
        now()
      );
    end if;
  end if;

  return uid;
end;
$$;

-- Look up roster login email + whether a password has been claimed.
create or replace function public.resolve_roster_login(p_name text)
returns table(email text, password_set boolean)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  matched_email text;
  matched_set boolean;
begin
  if nullif(trim(coalesce(p_name, '')), '') is null then
    raise exception 'Enter your full name';
  end if;

  select r.email, r.password_set
  into matched_email, matched_set
  from public.roster r
  where lower(trim(r.name)) = lower(trim(p_name))
  order by
    case when r.email like '%@gmail.com' then 0 else 1 end,
    r.email
  limit 1;

  if matched_email is null then
    raise exception 'Name is not on the internship roster';
  end if;

  email := matched_email;
  password_set := matched_set;
  return next;
end;
$$;

-- Allocate a password to an existing roster person (does not create a new roster row).
create or replace function public.create_roster_password(p_name text, p_password text)
returns text
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  matched public.roster%rowtype;
begin
  if nullif(trim(coalesce(p_name, '')), '') is null then
    raise exception 'Choose your name';
  end if;

  if length(coalesce(p_password, '')) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;

  select * into matched
  from public.roster
  where lower(trim(name)) = lower(trim(p_name))
  order by
    case when email like '%@gmail.com' then 0 else 1 end,
    email
  limit 1;

  if not found then
    raise exception 'Name is not on the internship roster';
  end if;

  if matched.password_set then
    raise exception 'An account already exists for this person. Log in with name and password.';
  end if;

  perform public.ensure_roster_auth_user(matched.email, matched.name, p_password);

  update public.roster
  set password_set = true
  where email = matched.email;

  return matched.email;
end;
$$;

-- Keep old name for compatibility: resolve email only (Auth checks the password).
create or replace function public.resolve_password_login(p_name text, p_password text)
returns text
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  matched_email text;
  has_password boolean;
begin
  select email, password_set into matched_email, has_password
  from public.resolve_roster_login(p_name);

  if not has_password then
    raise exception 'No password set yet. Create an account first.';
  end if;

  if nullif(p_password, '') is null then
    raise exception 'Enter your password';
  end if;

  return matched_email;
end;
$$;

grant execute on function public.resolve_roster_login(text) to anon, authenticated;
grant execute on function public.create_roster_password(text, text) to anon, authenticated;
grant execute on function public.resolve_password_login(text, text) to anon, authenticated;

-- Ensure Auth users exist and invalidate the shared "password" for everyone.
do $$
declare
  roster_row record;
begin
  -- Make pgcrypto visible for this block (Supabase installs it under extensions).
  perform set_config('search_path', 'public, auth, extensions', true);

  for roster_row in
    select distinct on (lower(trim(name)))
      email,
      name,
      password_set
    from public.roster
    order by
      lower(trim(name)),
      case when email like '%@gmail.com' then 0 else 1 end,
      email
  loop
    if roster_row.password_set then
      -- Keep claimed passwords; just ensure the Auth user / email identity exists.
      perform public.ensure_roster_auth_user(roster_row.email, roster_row.name, null);
    else
      -- Unclaimed: Auth user exists with a random password so shared "password" fails.
      perform public.ensure_roster_auth_user(roster_row.email, roster_row.name, gen_random_uuid()::text);
    end if;
  end loop;

  -- Anyone who never claimed a password gets a fresh random hash (kills shared "password").
  update auth.users u
  set
    encrypted_password = crypt(gen_random_uuid()::text, gen_salt('bf'::text)),
    updated_at = now()
  where lower(u.email) in (
    select lower(roster.email)
    from public.roster as roster
    where roster.password_set = false
  );
end $$;

notify pgrst, 'reload schema';
