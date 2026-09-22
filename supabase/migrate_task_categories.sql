-- Task categories (multi-select) + Test leader account for local testing.
-- Run in the Supabase SQL Editor.

create extension if not exists "pgcrypto";

alter table public.tasks
  add column if not exists categories jsonb not null default '[]'::jsonb;

create or replace function public.normalize_categories(p_categories jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  result jsonb := '[]'::jsonb;
  item text;
  allowed text[] := array['technical', 'social_media', 'event_planning', 'other'];
begin
  if p_categories is null or jsonb_typeof(p_categories) is distinct from 'array' then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb)
  into result
  from (
    select distinct trim(value) as v
    from jsonb_array_elements_text(p_categories) as t(value)
    where trim(value) = any (allowed)
  ) as cleaned;

  return coalesce(result, '[]'::jsonb);
end;
$$;

drop function if exists public.add_task(text, text, text, jsonb, jsonb, jsonb);

create or replace function public.add_task(
  p_title text,
  p_description text,
  p_assignee_id text default null,
  p_assignee_ids jsonb default null,
  p_attachments jsonb default '[]'::jsonb,
  p_subtasks jsonb default '[]'::jsonb,
  p_categories jsonb default '[]'::jsonb
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
  safe_categories jsonb;
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
  safe_categories := public.normalize_categories(p_categories);
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
    subtasks,
    categories
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
    safe_subtasks,
    safe_categories
  )
  returning * into task_row;

  return task_row;
end;
$$;

create or replace function public.update_task(
  p_task_id uuid,
  p_title text,
  p_description text,
  p_subtasks jsonb default '[]'::jsonb,
  p_categories jsonb default '[]'::jsonb
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
  safe_categories jsonb;
begin
  select * into me from public.current_profile();
  if me.role != 'leader' then
    raise exception 'Leaders only';
  end if;

  if nullif(trim(coalesce(p_title, '')), '') is null then
    raise exception 'Title is required';
  end if;

  safe_subtasks := public.normalize_subtasks(p_subtasks);
  safe_categories := public.normalize_categories(p_categories);

  update public.tasks
  set title = trim(p_title),
      description = trim(coalesce(p_description, '')),
      subtasks = safe_subtasks,
      categories = safe_categories,
      updated_at = now()
  where id = p_task_id
  returning * into task_row;

  if not found then
    raise exception 'Task not found';
  end if;

  return task_row;
end;
$$;

grant execute on function public.add_task(text, text, text, jsonb, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.update_task(uuid, text, text, jsonb, jsonb) to authenticated;

-- Test leader: name "Test", password "password"
insert into public.roster (email, name, role, password_set)
values ('test@taskhub.local', 'Test', 'leader', true)
on conflict (email) do update set
  name = excluded.name,
  role = excluded.role,
  password_set = true;

do $$
declare
  uid uuid;
  encrypted text;
begin
  perform set_config('search_path', 'public, auth, extensions', true);
  encrypted := crypt('password', gen_salt('bf'::text));

  select id into uid from auth.users where lower(email) = 'test@taskhub.local';

  if uid is null then
    uid := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000',
      uid, 'authenticated', 'authenticated', 'test@taskhub.local', encrypted, now(),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      jsonb_build_object('full_name', 'Test', 'name', 'Test'),
      now(), now(), '', '', '', ''
    );
    insert into auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), uid,
      jsonb_build_object('sub', uid::text, 'email', 'test@taskhub.local', 'email_verified', true, 'full_name', 'Test'),
      'email', uid::text, now(), now(), now()
    );
  else
    update auth.users
    set encrypted_password = encrypted,
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
          || jsonb_build_object('full_name', 'Test', 'name', 'Test'),
        updated_at = now()
    where id = uid;

    if not exists (select 1 from auth.identities where user_id = uid and provider = 'email') then
      insert into auth.identities (
        id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
      ) values (
        gen_random_uuid(), uid,
        jsonb_build_object('sub', uid::text, 'email', 'test@taskhub.local', 'email_verified', true, 'full_name', 'Test'),
        'email', uid::text, now(), now(), now()
      );
    end if;
  end if;
end $$;

notify pgrst, 'reload schema';
