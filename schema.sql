
-- ==================================================
-- FlowBudget – Full Schema
-- Safe to re-run in Supabase SQL Editor
-- ==================================================

-- USERS
create table if not exists users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamp default now()
);
alter table users enable row level security;
drop policy if exists "user select" on users;
drop policy if exists "user insert" on users;
drop policy if exists "user update" on users;
create policy "user select" on users for select using (true);
create policy "user insert" on users for insert with check (auth.uid() = id);
create policy "user update" on users for update using (auth.uid() = id);

-- GROUPS
create table if not exists groups (
  id bigint generated always as identity primary key,
  name text not null,
  invite_code text unique not null,
  owner_uuid uuid not null
);
alter table groups enable row level security;
drop policy if exists "group select" on groups;
drop policy if exists "group insert" on groups;
create policy "group select" on groups for select using (true);
create policy "group insert" on groups for insert with check (auth.uid() = owner_uuid);

-- GROUP MEMBERS
create table if not exists group_members (
  id bigint generated always as identity primary key,
  group_id bigint references groups(id) on delete cascade,
  user_uuid uuid not null,
  user_email text not null
);
alter table group_members enable row level security;
drop policy if exists "member select" on group_members;
drop policy if exists "member insert" on group_members;
create policy "member select" on group_members for select using (true);
create policy "member insert" on group_members for insert with check (auth.uid() = user_uuid);
drop policy if exists "member delete" on group_members;
create policy "member delete" on group_members for delete using (auth.uid() = user_uuid);

-- EXPENSES
create table if not exists expenses (
  id bigint generated always as identity primary key,
  group_id bigint references groups(id) on delete cascade,
  description text not null,
  amount numeric(10,2) not null,
  paid_by uuid references auth.users(id) not null,
  created_at timestamp default now()
);
alter table expenses enable row level security;
drop policy if exists "expense select" on expenses;
drop policy if exists "expense insert" on expenses;
create policy "expense select" on expenses for select using (true);
create policy "expense insert" on expenses for insert with check (auth.uid() = paid_by);

-- EXPENSE SPLITS (each member's share per expense)
create table if not exists expense_splits (
  id bigint generated always as identity primary key,
  expense_id bigint references expenses(id) on delete cascade,
  user_uuid uuid not null,
  amount numeric(10,2) not null
);
alter table expense_splits enable row level security;
drop policy if exists "split select" on expense_splits;
drop policy if exists "split insert" on expense_splits;
create policy "split select" on expense_splits for select using (true);
create policy "split insert" on expense_splits for insert
  with check (
    exists (
      select 1 from expenses
      where expenses.id = expense_splits.expense_id
        and expenses.paid_by = auth.uid()
    )
  );

-- SETTLEMENTS (recording payments between members)
create table if not exists settlements (
  id bigint generated always as identity primary key,
  group_id bigint references groups(id) on delete cascade,
  payer_uuid uuid not null,
  receiver_uuid uuid not null,
  amount numeric(10,2) not null,
  created_at timestamp default now()
);
alter table settlements enable row level security;
drop policy if exists "settlement select" on settlements;
drop policy if exists "settlement insert" on settlements;
create policy "settlement select" on settlements for select using (true);
create policy "settlement insert" on settlements for insert with check (auth.uid() = payer_uuid);

-- MIGRATION v2 (safe to re-run)
alter table expenses add column if not exists category text default 'other';
drop policy if exists "expense delete" on expenses;
create policy "expense delete" on expenses for delete using (auth.uid() = paid_by);

-- MIGRATION v3 (safe to re-run)
alter table groups add column if not exists currency text default 'USD';
