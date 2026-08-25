-- Point Kip Glazer's existing account at kip.glazer@mvla.net (no duplicate person).
-- Run in the Supabase SQL Editor after migrate_consolidate_roster.sql if that was applied.

do $$
declare
  old_email text := 'kip.glazer@taskhub.local';
  new_email text := 'kip.glazer@mvla.net';
  old_uid uuid;
  new_uid uuid;
begin
  insert into public.roster (email, name, role)
  values (new_email, 'Kip Glazer', 'leader')
  on conflict (email) do update
    set name = excluded.name,
        role = excluded.role;

  update public.tasks set assignee_id = new_email where assignee_id = old_email;
  update public.tasks set assigned_by_id = new_email where assigned_by_id = old_email;
  update public.tasks set created_by = new_email where created_by = old_email;

  select id into old_uid from auth.users where lower(email) = old_email;
  select id into new_uid from auth.users where lower(email) = new_email;

  if old_uid is not null and new_uid is not null and old_uid <> new_uid then
    -- mvla Google account already exists; keep it and drop the placeholder auth user.
    update public.profiles set email = new_email where email = old_email;
    delete from auth.users where id = old_uid;
  elsif old_uid is not null then
    update auth.users
    set email = new_email,
        updated_at = now()
    where id = old_uid;

    update auth.identities
    set identity_data = identity_data || jsonb_build_object('email', new_email),
        updated_at = now()
    where user_id = old_uid and provider = 'email';

    update public.profiles set email = new_email where email = old_email;
  else
    update public.profiles set email = new_email where email = old_email;
  end if;

  delete from public.roster where email = old_email;
end $$;
