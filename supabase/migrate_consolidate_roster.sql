-- Consolidate roster to one account per person.
-- - Remove all @mvla.net emails
-- - Keep personal Gmail when known
-- - Use @taskhub.local placeholders for password-only people (hidden in the UI)
--
-- Run in the Supabase SQL Editor, then re-run migrate_password_login.sql
-- so Auth users match the new roster emails.

-- 1) Ensure the consolidated roster rows exist.
insert into public.roster (email, name, role) values
  ('kip.glazer@taskhub.local', 'Kip Glazer', 'leader'),
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

-- 2) Remap task foreign keys from old @mvla.net ids to the single account per name.
create temporary table roster_email_map (
  old_email text primary key,
  new_email text not null
);

insert into roster_email_map (old_email, new_email) values
  ('kip.glazer@mvla.net', 'kip.glazer@taskhub.local'),
  ('100034112@mvla.net', 'myraniaj@gmail.com'),
  ('100031930@mvla.net', 'cinty.lin.cinty@gmail.com'),
  ('100032240@mvla.net', 'yashmahe2018@gmail.com'),
  ('100033302@mvla.net', 'nairjay30@gmail.com'),
  ('100032262@mvla.net', 'kcp7006@gmail.com'),
  ('100032027@mvla.net', 'emmakteng@gmail.com'),
  ('100035436@mvla.net', 'rishi.jindal@taskhub.local'),
  ('100033884@mvla.net', 'manuel.diuk@taskhub.local'),
  ('100033684@mvla.net', 'raya.aghazadeh@taskhub.local'),
  ('100033289@mvla.net', 'eliana.tekie@taskhub.local'),
  ('100034692@mvla.net', 'nathalie.zhang@taskhub.local'),
  ('100033492@mvla.net', 'mihikabob10@gmail.com'),
  ('100034056@mvla.net', 'caroline.yu@taskhub.local'),
  ('100033448@mvla.net', 'colby.liu@taskhub.local'),
  ('100034010@mvla.net', 'emma.fei@taskhub.local'),
  ('100033172@mvla.net', 'lucas.nam@taskhub.local'),
  ('100032190@mvla.net', 'ilan.gerber@taskhub.local');

update public.tasks t
set assignee_id = m.new_email
from roster_email_map m
where t.assignee_id = m.old_email;

update public.tasks t
set assigned_by_id = m.new_email
from roster_email_map m
where t.assigned_by_id = m.old_email;

update public.tasks t
set created_by = m.new_email
from roster_email_map m
where t.created_by = m.old_email;

-- 3) Drop profiles tied to old school emails (users re-create on next sign-in).
delete from public.profiles
where email like '%@mvla.net';

-- 4) Remove all school roster rows.
delete from public.roster
where email like '%@mvla.net';
