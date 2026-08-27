-- Task attachments: links + uploaded files (PDFs, images, docs).
-- Run in the Supabase SQL Editor.

alter table public.tasks
  add column if not exists attachments jsonb not null default '[]'::jsonb;

-- Drop older add_task signatures so only the attachments-aware version remains.
drop function if exists public.add_task(text, text, text);
drop function if exists public.add_task(text, text, text, jsonb);
create or replace function public.add_task(
  p_title text,
  p_description text,
  p_assignee_id text default null,
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

  if p_attachments is null or jsonb_typeof(p_attachments) is distinct from 'array' then
    safe_attachments := '[]'::jsonb;
  else
    safe_attachments := p_attachments;
  end if;

  insert into public.tasks (
    title,
    description,
    status,
    assignee_id,
    assigned_by_id,
    created_by,
    attachments
  )
  values (
    trim(p_title),
    trim(coalesce(p_description, '')),
    case when p_assignee_id is null then 'unclaimed' else 'just_started' end,
    p_assignee_id,
    case when p_assignee_id is null then null else me.email end,
    me.email,
    safe_attachments
  )
  returning * into task_row;

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

grant execute on function public.add_task(text, text, text, jsonb) to authenticated;
grant execute on function public.set_task_attachments(uuid, jsonb) to authenticated;

-- Storage bucket for uploaded files (public read URL; write for signed-in users).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'task-attachments',
  'task-attachments',
  true,
  10485760,
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "task attachments read" on storage.objects;
create policy "task attachments read"
  on storage.objects for select
  to authenticated, anon
  using (bucket_id = 'task-attachments');

drop policy if exists "task attachments upload" on storage.objects;
create policy "task attachments upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'task-attachments');

drop policy if exists "task attachments update" on storage.objects;
create policy "task attachments update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'task-attachments')
  with check (bucket_id = 'task-attachments');

drop policy if exists "task attachments delete" on storage.objects;
create policy "task attachments delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'task-attachments');
