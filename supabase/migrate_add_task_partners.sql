-- Let current assignees add partners to a task (merge into assignee_ids).
-- Run in the Supabase SQL Editor after migrate_multi_assignees.sql.

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

grant execute on function public.add_task_partners(uuid, jsonb) to authenticated;

-- Full partner list edit (add + remove). Caller must stay on the task.
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

grant execute on function public.set_task_partners(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';
