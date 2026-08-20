-- Restrict sign-in to roster emails only, and add Mihika's personal Gmail.
-- Run this in the Supabase SQL Editor.

insert into public.roster (email, name, role) values
  ('mihikabob10@gmail.com', 'Mihika Bobbarjung', 'intern')
on conflict (email) do update set
  name = excluded.name,
  role = excluded.role;

create or replace function public.sync_profile()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  user_email text;
  roster_row public.roster%rowtype;
  profile_row public.profiles%rowtype;
  avatar text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  user_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if user_email = '' then
    raise exception 'Google did not return an email address';
  end if;

  select * into roster_row from public.roster where email = user_email;
  if not found then
    raise exception 'This account is not on the internship roster';
  end if;

  avatar := coalesce(
    auth.jwt() -> 'user_metadata' ->> 'avatar_url',
    auth.jwt() -> 'user_metadata' ->> 'picture'
  );

  insert into public.profiles (id, email, name, role, picture)
  values (auth.uid(), roster_row.email, roster_row.name, roster_row.role, avatar)
  on conflict (id) do update
    set name = excluded.name,
        role = excluded.role,
        picture = coalesce(excluded.picture, public.profiles.picture)
  returning * into profile_row;

  return profile_row;
end;
$$;
