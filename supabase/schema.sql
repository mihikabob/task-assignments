-- Tech Internship Task Hub — run once in Supabase SQL Editor

create extension if not exists "pgcrypto";

-- Roster is the allowlist: only listed emails may sign in.
create table if not exists public.roster (
  email text primary key,
  name text not null,
  role text not null check (role in ('leader', 'intern'))
);

insert into public.roster (email, name, role) values
  ('kip.glazer@mvla.net', 'Kip Glazer', 'leader'),
  ('myraniaj@gmail.com', 'Myra Jain', 'leader'),
  ('cinty.lin.cinty@gmail.com', 'Cinty Lin', 'leader'),
  ('yashmahe2018@gmail.com', 'Yash Maheshwari', 'leader'),
  ('nairjay30@gmail.com', 'Jayan Nair', 'leader'),
  ('kcp7006@gmail.com', 'Keshav Pillutla', 'leader'),
  ('emmakteng@gmail.com', 'Emma Teng', 'leader'),
  ('rishi.jindal@taskhub.local', 'Rishi Jindal', 'intern'),
  ('manuel.diuk@taskhub.local', 'Manuel Diuk', 'intern'),
  ('raya.aghazadeh@taskhub.local', 'Raya Aghazadeh', 'intern'),
  ('eliana.tekie@taskhub.local', 'Eliana Tekie', 'intern'),
  ('nathalie.zhang@taskhub.local', 'Nathalie Zhang', 'intern'),
  ('mihikabob10@gmail.com', 'Mihika Bobbarjung', 'intern'),
  ('caroline.yu@taskhub.local', 'Caroline Yu', 'intern'),
  ('colby.liu@taskhub.local', 'Colby Liu', 'intern'),
  ('emma.fei@taskhub.local', 'Emma Fei', 'intern'),
  ('lucas.nam@taskhub.local', 'Lucas Nam', 'intern'),
  ('ilan.gerber@taskhub.local', 'Ilan Gerber', 'intern')
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
  assignee_ids jsonb not null default '[]'::jsonb,
  assigned_by_id text references public.roster (email),
  created_by text not null references public.roster (email),
  attachments jsonb not null default '[]'::jsonb,
  subtasks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_status_idx on public.tasks (status);
create index if not exists tasks_assignee_ids_gin on public.tasks using gin (assignee_ids);

alter table public.roster enable row level security;
alter table public.profiles enable row level security;
alter table public.tasks enable row level security;

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

-- Drop older add_task / assign_task signatures.
drop function if exists public.add_task(text, text, text);
drop function if exists public.add_task(text, text, text, jsonb);
drop function if exists public.add_task(text, text, text[], jsonb);
drop function if exists public.add_task(text, text, jsonb, jsonb);
drop function if exists public.assign_task(uuid, text);
drop function if exists public.assign_task(uuid, text[]);
drop function if exists public.assign_task(uuid, jsonb);

create or replace function public.assign_task(
  p_task_id uuid,
  p_assignee_id text default null,
  p_assignee_ids jsonb default null
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
  safe_assignees jsonb;
  first_assignee text;
begin
  select * into me from public.current_profile();
  if me.role != 'leader' then
    raise exception 'Leaders only';
  end if;

  select * into current from public.tasks where id = p_task_id;
  if not found then
    raise exception 'Task not found';
  end if;

  if p_assignee_ids is not null and jsonb_typeof(p_assignee_ids) = 'array' then
    safe_assignees := (
      select coalesce(jsonb_agg(to_jsonb(trim(value))), '[]'::jsonb)
      from jsonb_array_elements_text(p_assignee_ids) as t(value)
      where nullif(trim(value), '') is not null
    );
  elsif p_assignee_id is not null and trim(p_assignee_id) <> '' then
    safe_assignees := jsonb_build_array(trim(p_assignee_id));
  else
    safe_assignees := '[]'::jsonb;
  end if;

  if exists (
    select 1
    from jsonb_array_elements_text(safe_assignees) as e(email)
    where not exists (select 1 from public.roster r where r.email = e.email)
  ) then
    raise exception 'Invalid assignee';
  end if;

  first_assignee := nullif(safe_assignees ->> 0, '');

  update public.tasks
  set assignee_id = first_assignee,
      assignee_ids = safe_assignees,
      assigned_by_id = case when jsonb_array_length(safe_assignees) = 0 then null else me.email end,
      status = case
        when jsonb_array_length(safe_assignees) = 0 then 'unclaimed'
        when current.status = 'unclaimed' then 'just_started'
        else current.status
      end,
      updated_at = now()
  where id = p_task_id
  returning * into task_row;

  return task_row;
end;
$$;

drop function if exists public.add_task(text, text, text);
drop function if exists public.add_task(text, text, text, jsonb);
drop function if exists public.add_task(text, text, text[], jsonb);
drop function if exists public.add_task(text, text, jsonb, jsonb);

create or replace function public.normalize_subtasks(p_subtasks jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  result jsonb := '[]'::jsonb;
  item jsonb;
  item_id text;
  item_title text;
  item_done boolean;
begin
  if p_subtasks is null or jsonb_typeof(p_subtasks) is distinct from 'array' then
    return '[]'::jsonb;
  end if;

  for item in select value from jsonb_array_elements(p_subtasks)
  loop
    if jsonb_typeof(item) is distinct from 'object' then
      continue;
    end if;

    item_title := nullif(trim(coalesce(item ->> 'title', '')), '');
    if item_title is null then
      continue;
    end if;

    item_id := nullif(trim(coalesce(item ->> 'id', '')), '');
    if item_id is null then
      item_id := gen_random_uuid()::text;
    end if;

    item_done := coalesce((item ->> 'done')::boolean, false);

    result := result || jsonb_build_array(
      jsonb_build_object(
        'id', item_id,
        'title', item_title,
        'done', item_done
      )
    );
  end loop;

  return result;
end;
$$;

create or replace function public.add_task(
  p_title text,
  p_description text,
  p_assignee_id text default null,
  p_assignee_ids jsonb default null,
  p_attachments jsonb default '[]'::jsonb,
  p_subtasks jsonb default '[]'::jsonb
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
  safe_attachments jsonb;
  safe_assignees jsonb;
  safe_subtasks jsonb;
  first_assignee text;
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

  if p_assignee_ids is not null and jsonb_typeof(p_assignee_ids) = 'array' then
    safe_assignees := (
      select coalesce(jsonb_agg(to_jsonb(trim(value))), '[]'::jsonb)
      from jsonb_array_elements_text(p_assignee_ids) as t(value)
      where nullif(trim(value), '') is not null
    );
  elsif p_assignee_id is not null and trim(p_assignee_id) <> '' then
    safe_assignees := jsonb_build_array(trim(p_assignee_id));
  else
    safe_assignees := '[]'::jsonb;
  end if;

  if exists (
    select 1
    from jsonb_array_elements_text(safe_assignees) as e(email)
    where not exists (select 1 from public.roster r where r.email = e.email)
  ) then
    raise exception 'Invalid assignee';
  end if;

  if p_attachments is null or jsonb_typeof(p_attachments) is distinct from 'array' then
    safe_attachments := '[]'::jsonb;
  else
    safe_attachments := p_attachments;
  end if;

  safe_subtasks := public.normalize_subtasks(p_subtasks);
  first_assignee := nullif(safe_assignees ->> 0, '');

  insert into public.tasks (
    title,
    description,
    status,
    assignee_id,
    assignee_ids,
    assigned_by_id,
    created_by,
    attachments,
    subtasks
  )
  values (
    trim(p_title),
    trim(coalesce(p_description, '')),
    case when jsonb_array_length(safe_assignees) = 0 then 'unclaimed' else 'just_started' end,
    first_assignee,
    safe_assignees,
    case when jsonb_array_length(safe_assignees) = 0 then null else me.email end,
    me.email,
    safe_attachments,
    safe_subtasks
  )
  returning * into task_row;

  return task_row;
end;
$$;

create or replace function public.update_task(
  p_task_id uuid,
  p_title text,
  p_description text,
  p_subtasks jsonb default '[]'::jsonb
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
  safe_subtasks jsonb;
begin
  select * into me from public.current_profile();
  if me.role != 'leader' then
    raise exception 'Leaders only';
  end if;

  if nullif(trim(coalesce(p_title, '')), '') is null then
    raise exception 'Title is required';
  end if;

  safe_subtasks := public.normalize_subtasks(p_subtasks);

  update public.tasks
  set title = trim(p_title),
      description = trim(coalesce(p_description, '')),
      subtasks = safe_subtasks,
      updated_at = now()
  where id = p_task_id
  returning * into task_row;

  if not found then
    raise exception 'Task not found';
  end if;

  return task_row;
end;
$$;

create or replace function public.set_subtask_done(
  p_task_id uuid,
  p_subtask_id text,
  p_done boolean
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
  next_subtasks jsonb := '[]'::jsonb;
  item jsonb;
  subtask_found boolean := false;
  any_done boolean := false;
begin
  select * into me from public.current_profile();

  select * into current from public.tasks where id = p_task_id;
  if not found then
    raise exception 'Task not found';
  end if;

  if not (
    me.email = current.assignee_id
    or coalesce(current.assignee_ids, '[]'::jsonb) @> to_jsonb(me.email)
  ) then
    raise exception 'Only people on this task can check off subtasks';
  end if;

  if nullif(trim(coalesce(p_subtask_id, '')), '') is null then
    raise exception 'Subtask id is required';
  end if;

  for item in select value from jsonb_array_elements(coalesce(current.subtasks, '[]'::jsonb))
  loop
    if (item ->> 'id') = p_subtask_id then
      subtask_found := true;
      item := jsonb_set(item, '{done}', to_jsonb(coalesce(p_done, false)));
    end if;
    if coalesce((item ->> 'done')::boolean, false) then
      any_done := true;
    end if;
    next_subtasks := next_subtasks || jsonb_build_array(item);
  end loop;

  if not subtask_found then
    raise exception 'Subtask not found';
  end if;

  update public.tasks
  set subtasks = next_subtasks,
      status = case
        when coalesce(p_done, false)
          and any_done
          and current.status in ('just_started', 'unclaimed')
        then 'in_progress'
        else current.status
      end,
      updated_at = now()
  where id = p_task_id
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
      assignee_ids = jsonb_build_array(me.email),
      assigned_by_id = null,
      status = 'just_started',
      updated_at = now()
  where id = p_task_id
    and assignee_id is null
    and jsonb_array_length(coalesce(assignee_ids, '[]'::jsonb)) = 0
  returning * into task_row;

  if not found then
    raise exception 'Task is not available to claim';
  end if;

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
    and (
      assignee_id = me.email
      or assignee_ids @> to_jsonb(me.email)
    )
  returning * into task_row;

  if not found then
    raise exception 'You can only update your own assigned tasks';
  end if;

  return task_row;
end;
$$;

create or replace function public.set_task_attachments(
  p_task_id uuid,
  p_attachments jsonb
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
  safe_attachments jsonb;
begin
  select * into me from public.current_profile();
  if me.role != 'leader' then
    raise exception 'Leaders only';
  end if;

  if p_attachments is null or jsonb_typeof(p_attachments) is distinct from 'array' then
    safe_attachments := '[]'::jsonb;
  else
    safe_attachments := p_attachments;
  end if;

  update public.tasks
  set attachments = safe_attachments,
      updated_at = now()
  where id = p_task_id
  returning * into task_row;

  if not found then
    raise exception 'Task not found';
  end if;

  return task_row;
end;
$$;

create or replace function public.add_task_partners(
  p_task_id uuid,
  p_partner_ids jsonb default '[]'::jsonb
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
  current_assignees jsonb;
  new_partners jsonb;
  merged jsonb;
  first_assignee text;
begin
  select * into me from public.current_profile();

  select * into current from public.tasks where id = p_task_id;
  if not found then
    raise exception 'Task not found';
  end if;

  if not (
    me.email = current.assignee_id
    or coalesce(current.assignee_ids, '[]'::jsonb) @> to_jsonb(me.email)
  ) then
    raise exception 'Only people on this task can add partners';
  end if;

  current_assignees := coalesce(current.assignee_ids, '[]'::jsonb);
  if jsonb_array_length(current_assignees) = 0 and current.assignee_id is not null then
    current_assignees := jsonb_build_array(current.assignee_id);
  end if;

  if p_partner_ids is null or jsonb_typeof(p_partner_ids) is distinct from 'array' then
    new_partners := '[]'::jsonb;
  else
    new_partners := (
      select coalesce(jsonb_agg(to_jsonb(trim(value))), '[]'::jsonb)
      from jsonb_array_elements_text(p_partner_ids) as t(value)
      where nullif(trim(value), '') is not null
    );
  end if;

  if exists (
    select 1
    from jsonb_array_elements_text(new_partners) as e(email)
    where not exists (select 1 from public.roster r where r.email = e.email)
  ) then
    raise exception 'Invalid partner';
  end if;

  merged := (
    select coalesce(jsonb_agg(to_jsonb(email)), '[]'::jsonb)
    from (
      select distinct trim(value) as email
      from (
        select jsonb_array_elements_text(current_assignees) as value
        union all
        select jsonb_array_elements_text(new_partners) as value
      ) as emails
      where nullif(trim(value), '') is not null
    ) as unique_emails
  );

  first_assignee := nullif(merged ->> 0, '');

  update public.tasks
  set assignee_id = first_assignee,
      assignee_ids = merged,
      updated_at = now()
  where id = p_task_id
  returning * into task_row;

  return task_row;
end;
$$;

create or replace function public.set_task_partners(
  p_task_id uuid,
  p_assignee_ids jsonb default '[]'::jsonb
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
  next_assignees jsonb;
  first_assignee text;
begin
  select * into me from public.current_profile();

  select * into current from public.tasks where id = p_task_id;
  if not found then
    raise exception 'Task not found';
  end if;

  if not (
    me.email = current.assignee_id
    or coalesce(current.assignee_ids, '[]'::jsonb) @> to_jsonb(me.email)
  ) then
    raise exception 'Only people on this task can edit partners';
  end if;

  if p_assignee_ids is null or jsonb_typeof(p_assignee_ids) is distinct from 'array' then
    next_assignees := '[]'::jsonb;
  else
    next_assignees := (
      select coalesce(jsonb_agg(to_jsonb(trim(value))), '[]'::jsonb)
      from jsonb_array_elements_text(p_assignee_ids) as t(value)
      where nullif(trim(value), '') is not null
    );
  end if;

  if exists (
    select 1
    from jsonb_array_elements_text(next_assignees) as e(email)
    where not exists (select 1 from public.roster r where r.email = e.email)
  ) then
    raise exception 'Invalid partner';
  end if;

  if jsonb_array_length(next_assignees) = 0 then
    first_assignee := null;
  else
    first_assignee := nullif(next_assignees ->> 0, '');
  end if;

  update public.tasks
  set assignee_id = first_assignee,
      assignee_ids = next_assignees,
      updated_at = now()
  where id = p_task_id
  returning * into task_row;

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

-- Name + password login: returns the roster email used for Auth.
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

  select email into matched_email
  from public.roster
  where lower(trim(name)) = lower(trim(p_name))
  order by
    case when email like '%@gmail.com' then 0 else 1 end,
    email
  limit 1;

  if matched_email is null then
    raise exception 'Invalid name or password';
  end if;

  return matched_email;
end;
$$;

grant usage on schema public to anon, authenticated;
grant select on public.roster to authenticated;
grant select on public.profiles to authenticated;
grant select on public.tasks to authenticated;
grant execute on function public.sync_profile() to authenticated;
grant execute on function public.resolve_password_login(text, text) to anon, authenticated;
grant execute on function public.add_task(text, text, text, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.update_task(uuid, text, text, jsonb) to authenticated;
grant execute on function public.set_subtask_done(uuid, text, boolean) to authenticated;
grant execute on function public.set_task_attachments(uuid, jsonb) to authenticated;
grant execute on function public.claim_task(uuid) to authenticated;
grant execute on function public.assign_task(uuid, text, jsonb) to authenticated;
grant execute on function public.add_task_partners(uuid, jsonb) to authenticated;
grant execute on function public.set_task_partners(uuid, jsonb) to authenticated;
grant execute on function public.update_task_status(uuid, text) to authenticated;
grant execute on function public.delete_task(uuid) to authenticated;
grant execute on function public.discard_completed() to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.tasks;
exception
  when duplicate_object then null;
end $$;
-- If realtime still is not live, open Supabase → Database → Publications and add public.tasks to supabase_realtime.
