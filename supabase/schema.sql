-- Tech Internship Task Hub — run once in Supabase SQL Editor

create extension if not exists "pgcrypto";

-- Roster is the source of truth for who may sign in and their role.
create table if not exists public.roster (
  email text primary key,
  name text not null,
  role text not null check (role in ('leader', 'intern'))
);

insert into public.roster (email, name, role) values
  ('kip.glazer@mvla.net', 'Kip Glazer', 'leader'),
  ('100034112@mvla.net', 'Myra Jain', 'leader'),
  ('100031930@mvla.net', 'Cinty Lin', 'leader'),
  ('100032240@mvla.net', 'Yash Maheshwari', 'leader'),
  ('100033302@mvla.net', 'Jayan Nair', 'leader'),
  ('100032262@mvla.net', 'Keshav Pillutla', 'leader'),
  ('100032027@mvla.net', 'Emma Teng', 'leader'),
  ('100035436@mvla.net', 'Rishi Jindal', 'intern'),
  ('100033884@mvla.net', 'Manuel Diuk', 'intern'),
  ('100033684@mvla.net', 'Raya Aghazadeh', 'intern'),
  ('100033289@mvla.net', 'Eliana Tekie', 'intern'),
  ('100034692@mvla.net', 'Nathalie Zhang', 'intern'),
  ('100033492@mvla.net', 'Mihika Bobbarjung', 'intern'),
  ('100034056@mvla.net', 'Caroline Yu', 'intern'),
  ('100033448@mvla.net', 'Colby Liu', 'intern'),
  ('100034010@mvla.net', 'Emma Fei', 'intern'),
  ('100033172@mvla.net', 'Lucas Nam', 'intern'),
  ('100032190@mvla.net', 'Ilan Gerber', 'intern')
on conflict (email) do update set
  name = excluded.name,
  role = excluded.role;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique references public.roster (email),
  name text not null,
  role text not null check (role in ('leader', 'intern')),
  picture text
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  status text not null check (status in ('unclaimed', 'just_started', 'in_progress', 'complete')),
  assignee_id text references public.roster (email),
  assigned_by_id text references public.roster (email),
  created_by text not null references public.roster (email),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_status_idx on public.tasks (status);
create index if not exists tasks_assignee_idx on public.tasks (assignee_id);

alter table public.roster enable row level security;
alter table public.profiles enable row level security;
alter table public.tasks enable row level security;

create policy "roster read for signed in"
  on public.roster for select
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid()));

create policy "profiles read for signed in"
  on public.profiles for select
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid()));

create policy "tasks read for signed in"
  on public.tasks for select
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid()));

create or replace function public.current_profile()
returns public.profiles
language sql
stable
security definer
set search_path = public
as $$
  select * from public.profiles where id = auth.uid();
$$;

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
  if user_email = '' or right(user_email, 9) != '@mvla.net' then
    raise exception 'Sign in with your @mvla.net account';
  end if;

  select * into roster_row from public.roster where email = user_email;
  if not found then
    raise exception 'This account is not on the internship roster';
  end if;

  avatar := coalesce(auth.jwt() -> 'user_metadata' ->> 'avatar_url', auth.jwt() -> 'user_metadata' ->> 'picture');

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

create or replace function public.add_task(
  p_title text,
  p_description text,
  p_assignee_id text default null
)
returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.profiles%rowtype;
  task_row public.tasks%rowtype;
begin
  select * into me from public.current_profile();
  if me.role != 'leader' then
    raise exception 'Leaders only';
  end if;

  if p_assignee_id is not null and not exists (
    select 1 from public.roster where email = p_assignee_id
  ) then
    raise exception 'Invalid assignee';
  end if;

  insert into public.tasks (title, description, status, assignee_id, assigned_by_id, created_by)
  values (
    trim(p_title),
    trim(coalesce(p_description, '')),
    case when p_assignee_id is null then 'unclaimed' else 'just_started' end,
    p_assignee_id,
    case when p_assignee_id is null then null else me.email end,
    me.email
  )
  returning * into task_row;

  return task_row;
end;
$$;

create or replace function public.claim_task(p_task_id uuid)
returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.profiles%rowtype;
  task_row public.tasks%rowtype;
begin
  select * into me from public.current_profile();
  if me.role != 'intern' then
    raise exception 'Interns only';
  end if;

  update public.tasks
  set assignee_id = me.email,
      assigned_by_id = null,
      status = 'just_started',
      updated_at = now()
  where id = p_task_id
    and assignee_id is null
  returning * into task_row;

  if not found then
    raise exception 'Task is not available to claim';
  end if;

  return task_row;
end;
$$;

create or replace function public.assign_task(
  p_task_id uuid,
  p_assignee_id text default null
)
returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.profiles%rowtype;
  task_row public.tasks%rowtype;
  current public.tasks%rowtype;
begin
  select * into me from public.current_profile();
  if me.role != 'leader' then
    raise exception 'Leaders only';
  end if;

  select * into current from public.tasks where id = p_task_id;
  if not found then
    raise exception 'Task not found';
  end if;

  if p_assignee_id is not null and not exists (
    select 1 from public.roster where email = p_assignee_id
  ) then
    raise exception 'Invalid assignee';
  end if;

  update public.tasks
  set assignee_id = p_assignee_id,
      assigned_by_id = case when p_assignee_id is null then null else me.email end,
      status = case
        when p_assignee_id is null then 'unclaimed'
        when current.status = 'unclaimed' then 'just_started'
        else current.status
      end,
      updated_at = now()
  where id = p_task_id
  returning * into task_row;

  return task_row;
end;
$$;

create or replace function public.update_task_status(
  p_task_id uuid,
  p_status text
)
returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.profiles%rowtype;
  task_row public.tasks%rowtype;
begin
  select * into me from public.current_profile();
  if p_status not in ('just_started', 'in_progress', 'complete') then
    raise exception 'Invalid status';
  end if;

  update public.tasks
  set status = p_status,
      updated_at = now()
  where id = p_task_id
    and assignee_id = me.email
  returning * into task_row;

  if not found then
    raise exception 'You can only update your own assigned tasks';
  end if;

  return task_row;
end;
$$;

create or replace function public.delete_task(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.profiles%rowtype;
begin
  select * into me from public.current_profile();
  if me.role != 'leader' then
    raise exception 'Leaders only';
  end if;

  delete from public.tasks where id = p_task_id;
end;
$$;

create or replace function public.discard_completed()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.profiles%rowtype;
  removed integer;
begin
  select * into me from public.current_profile();
  if me.role != 'leader' then
    raise exception 'Leaders only';
  end if;

  delete from public.tasks where status = 'complete';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

grant usage on schema public to anon, authenticated;
grant select on public.roster to authenticated;
grant select on public.profiles to authenticated;
grant select on public.tasks to authenticated;
grant execute on function public.sync_profile() to authenticated;
grant execute on function public.add_task(text, text, text) to authenticated;
grant execute on function public.claim_task(uuid) to authenticated;
grant execute on function public.assign_task(uuid, text) to authenticated;
grant execute on function public.update_task_status(uuid, text) to authenticated;
grant execute on function public.delete_task(uuid) to authenticated;
grant execute on function public.discard_completed() to authenticated;

alter publication supabase_realtime add table public.tasks;
-- If the line above errors, open Supabase → Database → Publications and add public.tasks to supabase_realtime.
