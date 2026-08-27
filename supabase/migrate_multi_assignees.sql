-- Single + multi assign: one assign_task RPC (no overload ambiguity).
-- Keeps assignee_id for single assign; assignee_ids jsonb for multiple.
-- Safe to re-run (handles legacy text[] assignee_ids column).

alter table public.tasks
  add column if not exists assignee_id text references public.roster (email);

-- Normalize assignee_ids to jsonb (may exist today as text[] from an earlier migration).
do $$
declare
  col_type text;
begin
  select data_type into col_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'tasks'
    and column_name = 'assignee_ids';

  if col_type is null then
    alter table public.tasks
      add column assignee_ids jsonb not null default '[]'::jsonb;
  elsif col_type = 'ARRAY' then
    alter table public.tasks
      alter column assignee_ids drop default;

    alter table public.tasks
      alter column assignee_ids type jsonb
      using case
        when assignee_ids is null or cardinality(assignee_ids) = 0 then '[]'::jsonb
        else to_jsonb(assignee_ids)
      end;

    alter table public.tasks
      alter column assignee_ids set default '[]'::jsonb;

    alter table public.tasks
      alter column assignee_ids set not null;
  elsif col_type <> 'jsonb' then
    raise exception 'tasks.assignee_ids has unexpected type: %', col_type;
  end if;
end $$;

-- Backfill both columns from whichever source has data.
update public.tasks
set assignee_ids = jsonb_build_array(assignee_id)
where assignee_id is not null
  and jsonb_array_length(coalesce(assignee_ids, '[]'::jsonb)) = 0;

update public.tasks
set assignee_id = nullif(assignee_ids ->> 0, '')
where assignee_id is null
  and jsonb_array_length(coalesce(assignee_ids, '[]'::jsonb)) > 0;

drop index if exists public.tasks_assignee_idx;
drop index if exists public.tasks_assignee_ids_idx;
create index if not exists tasks_assignee_ids_gin
  on public.tasks using gin (assignee_ids);

drop function if exists public.assign_task(uuid, text);
drop function if exists public.assign_task(uuid, text[]);
drop function if exists public.assign_task(uuid, jsonb);
drop function if exists public.assign_task(uuid, text, jsonb);

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
drop function if exists public.add_task(text, text, text, jsonb, jsonb);

create or replace function public.add_task(
  p_title text,
  p_description text,
  p_assignee_id text default null,
  p_assignee_ids jsonb default null,
  p_attachments jsonb default '[]'::jsonb
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

  first_assignee := nullif(safe_assignees ->> 0, '');

  insert into public.tasks (
    title,
    description,
    status,
    assignee_id,
    assignee_ids,
    assigned_by_id,
    created_by,
    attachments
  )
  values (
    trim(p_title),
    trim(coalesce(p_description, '')),
    case when jsonb_array_length(safe_assignees) = 0 then 'unclaimed' else 'just_started' end,
    first_assignee,
    safe_assignees,
    case when jsonb_array_length(safe_assignees) = 0 then null else me.email end,
    me.email,
    safe_attachments
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

grant execute on function public.assign_task(uuid, text, jsonb) to authenticated;
grant execute on function public.add_task(text, text, text, jsonb, jsonb) to authenticated;
grant execute on function public.claim_task(uuid) to authenticated;
grant execute on function public.update_task_status(uuid, text) to authenticated;

notify pgrst, 'reload schema';
