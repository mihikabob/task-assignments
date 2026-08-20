-- Add personal Gmail addresses for leaders.
-- Run this in the Supabase SQL Editor.

insert into public.roster (email, name, role) values
  ('myraniaj@gmail.com', 'Myra Jain', 'leader'),
  ('cinty.lin.cinty@gmail.com', 'Cinty Lin', 'leader'),
  ('kcp7006@gmail.com', 'Keshav Pillutla', 'leader'),
  ('emmakteng@gmail.com', 'Emma Teng', 'leader'),
  ('yashmahe2018@gmail.com', 'Yash Maheshwari', 'leader'),
  ('nairjay30@gmail.com', 'Jayan Nair', 'leader')
on conflict (email) do update set
  name = excluded.name,
  role = excluded.role;
