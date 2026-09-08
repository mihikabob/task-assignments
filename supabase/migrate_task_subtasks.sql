-- Task subtasks: checklist items leaders define; assignees can check off.
-- Run in the Supabase SQL Editor after migrate_multi_assignees.sql.

alter table public.tasks
  add column if not exists subtasks jsonb not null default '[]'::jsonb;

-- Normalize a jsonb array of { id, title, done } objects.
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

-- Replace add_task with subtasks support (keep prior params).
drop function if exists public.add_task(text, text, text, jsonb, jsonb);
drop function if exists public.add_task(text, text, text, jsonb);
drop function if exists public.add_task(text, text, text);

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

-- Leaders edit title, description, and subtasks after publish.
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

-- Assignees check/uncheck a subtask; first completion moves status to in_progress.
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

grant execute on function public.add_task(text, text, text, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.update_task(uuid, text, text, jsonb) to authenticated;
grant execute on function public.set_subtask_done(uuid, text, boolean) to authenticated;

notify pgrst, 'reload schema';
