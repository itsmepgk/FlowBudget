
create table groups (
 id bigint generated always as identity primary key,
 name text not null,
 invite_code text unique not null,
 owner_uuid uuid not null
);

create table group_members (
 id bigint generated always as identity primary key,
 group_id bigint references groups(id) on delete cascade,
 user_uuid uuid not null,
 user_email text not null
);

alter table groups enable row level security;
alter table group_members enable row level security;

create policy "group select"
on groups for select
using (true);

create policy "group insert"
on groups for insert
with check (auth.uid() = owner_uuid);

create policy "member select"
on group_members for select
using (auth.uid() = user_uuid);

create policy "member insert"
on group_members for insert
with check (auth.uid() = user_uuid);

create table users (
 id uuid primary key references auth.users(id) on delete cascade,
 name text not null,
 created_at timestamp default now()
);

alter table users enable row level security;

create policy "user select"
on users for select
using (auth.uid() = id);

create policy "user insert"
on users for insert
with check (auth.uid() = id);

create policy "user update"
on users for update
using (auth.uid() = id);
