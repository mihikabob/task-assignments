-- Fix tasks not persisting / not visible to interns after a leader publishes.
-- Cause: RLS on tasks with no INSERT policy can block SECURITY DEFINER writes
-- when row security is forced; SELECT policies that depend on profiles can also fail.
--
-- Run this in the Supabase SQL Editor, then try Add task again.

-- Any signed-in user with a session can read the shared board.
drop policy if exists "roster read for signed in" on public.roster;
create policy "roster read for signed in"
  on public.roster for select
  to authenticated
  using (true);

drop policy if exists "profiles read for signed in" on public.profiles;
create policy "profiles read for signed in"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "tasks read for signed in" on public.tasks;
create policy "tasks read for signed in"
  on public.tasks for select
  to authenticated
  using (true);

create or replace function public.current_profile()
returns public.profiles
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select * from public.profiles where id = auth.uid();
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
set row_security = off
as $$
declare
  me public.profiles%rowtype;
  task_row public.tasks%rowtype;
begin
  select * into me from public.current_profile();
  if me.id is null then
    raise exception 'Not authenticated';
  end if;
  if me.role != 'leader' then
    raise exception 'Leaders only';
  end if;

  if nullif(trim(coalesce(p_title, '')), '') is null then
    raise exception 'Title is required';
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
set row_security = off
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
set row_security = off
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
set row_security = off
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
set row_security = off
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
set row_security = off
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

grant execute on function public.add_task(text, text, text) to authenticated;
grant execute on function public.claim_task(uuid) to authenticated;
grant execute on function public.assign_task(uuid, text) to authenticated;
grant execute on function public.update_task_status(uuid, text) to authenticated;
grant execute on function public.delete_task(uuid) to authenticated;
grant execute on function public.discard_completed() to authenticated;
grant select on public.tasks to authenticated;
grant select on public.roster to authenticated;
grant select on public.profiles to authenticated;
