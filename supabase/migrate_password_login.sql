-- Password login for roster members (name + password).
-- Default password for everyone: password
--
-- Also enable Email provider in Supabase:
-- Authentication → Providers → Email → Enable
-- (Confirm email can stay off for this demo.)
--
-- Run in the Supabase SQL Editor.

create extension if not exists "pgcrypto";

-- Resolve a roster full name + password to the account email used for Auth.
create or replace function public.resolve_password_login(p_name text, p_password text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_email text;
begin
  if nullif(trim(coalesce(p_name, '')), '') is null then
    raise exception 'Enter your full name';
  end if;

  if p_password is distinct from 'password' then
    raise exception 'Invalid name or password';
  end if;

  -- One account per person: prefer @mvla.net when multiple emails exist.
  select email into matched_email
  from public.roster
  where lower(trim(name)) = lower(trim(p_name))
  order by
    case when email like '%@mvla.net' then 0 else 1 end,
    email
  limit 1;

  if matched_email is null then
    raise exception 'Invalid name or password';
  end if;

  return matched_email;
end;
$$;

grant execute on function public.resolve_password_login(text, text) to anon, authenticated;

-- Create / reset Auth users for each unique roster person (canonical email).
do $$
declare
  r record;
  uid uuid;
  encrypted text;
begin
  encrypted := crypt('password', gen_salt('bf'));

  for r in
    select distinct on (lower(trim(name)))
      email,
      name
    from public.roster
    order by
      lower(trim(name)),
      case when email like '%@mvla.net' then 0 else 1 end,
      email
  loop
    select id into uid from auth.users where lower(email) = lower(r.email);

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
        lower(r.email),
        encrypted,
        now(),
        jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
        jsonb_build_object('full_name', r.name, 'name', r.name),
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
          'email', lower(r.email),
          'email_verified', true,
          'full_name', r.name
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
        encrypted_password = encrypted,
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        raw_user_meta_data =
          coalesce(raw_user_meta_data, '{}'::jsonb)
          || jsonb_build_object('full_name', r.name, 'name', r.name),
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
            'email', lower(r.email),
            'email_verified', true,
            'full_name', r.name
          ),
          'email',
          uid::text,
          now(),
          now(),
          now()
        );
      end if;
    end if;
  end loop;
end $$;
