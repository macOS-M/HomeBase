-- HomeBase — Supabase Schema
-- Run this in your Supabase SQL editor.
-- Enables Row Level Security so users can only access their own household data.

-- ─── Extensions ──────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─── Households ──────────────────────────────────────────────────────────────
create table households (
  id              uuid primary key default uuid_generate_v4(),
  name            text not null,
  created_by      uuid references auth.users(id) on delete set null,
  monthly_income  numeric(10,2),
  budget_period   text not null default 'monthly' check (budget_period in ('monthly','biweekly','custom')),
  invite_code     text not null unique default upper(substring(md5(random()::text) from 1 for 6)),
  created_at      timestamptz not null default now()
);

alter table households enable row level security;

create policy "Authenticated users can create households"
  on households for insert
  with check (created_by = auth.uid());

-- ─── Members ─────────────────────────────────────────────────────────────────
create table members (
  id            uuid primary key default uuid_generate_v4(),
  household_id  uuid not null references households(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  email         text not null,
  avatar_url    text,
  monthly_budget numeric(10,2) not null default 0 check (monthly_budget >= 0),
  role          text not null default 'member' check (role in ('admin','member')),
  joined_at     timestamptz not null default now(),
  unique (household_id, user_id)
);

alter table members add column if not exists monthly_budget numeric(10,2) not null default 0;
alter table members drop constraint if exists members_monthly_budget_check;
alter table members add constraint members_monthly_budget_check check (monthly_budget >= 0);

alter table members enable row level security;

create or replace function is_household_member(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from members
    where household_id = p_household_id
      and user_id = auth.uid()
  );
$$;

create or replace function is_household_admin(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from members
    where household_id = p_household_id
      and user_id = auth.uid()
      and role = 'admin'
  );
$$;

create policy "Members can view others in their household"
  on members for select
  using (
    user_id = auth.uid() or is_household_member(household_id)
  );

create policy "Admin can manage members"
  on members for all
  using (
    is_household_admin(household_id)
  );

create policy "Users can insert themselves"
  on members for insert
  with check (user_id = auth.uid());

create policy "Members can view their household"
  on households for select
  using (
    is_household_member(id)
    or created_by = auth.uid()
  );

create policy "Creator can update household"
  on households for update
  using (created_by = auth.uid());

-- ─── Categories ──────────────────────────────────────────────────────────────
create table categories (
  id            uuid primary key default uuid_generate_v4(),
  household_id  uuid not null references households(id) on delete cascade,
  name          text not null,
  icon          text not null default '📦',
  color         text not null default '#6B6560',
  budget_limit  numeric(10,2),
  is_grocery    boolean not null default false
);

alter table categories enable row level security;

create policy "Household members can manage categories"
  on categories for all
  using (
    is_household_member(household_id)
  );

-- Seed default categories (called after household creation via function below)

-- ─── Expenses ────────────────────────────────────────────────────────────────
create table expenses (
  id            uuid primary key default uuid_generate_v4(),
  household_id  uuid not null references households(id) on delete cascade,
  name          text not null,
  amount        numeric(10,2) not null check (amount > 0),
  category_id   uuid references categories(id) on delete set null,
  paid_by       uuid not null references members(id) on delete restrict,
  split_type    text not null default 'equal' check (split_type in ('equal','percentage','assigned')),
  date          date not null default current_date,
  receipt_url   text,
  notes         text,
  created_at    timestamptz not null default now()
);

alter table expenses enable row level security;

create policy "Household members can manage expenses"
  on expenses for all
  using (
    is_household_member(household_id)
  );

-- ─── Expense Splits ───────────────────────────────────────────────────────────
create table expense_splits (
  id          uuid primary key default uuid_generate_v4(),
  expense_id  uuid not null references expenses(id) on delete cascade,
  member_id   uuid not null references members(id) on delete cascade,
  amount      numeric(10,2) not null,
  percentage  numeric(5,2),
  is_settled  boolean not null default false
);

alter table expense_splits enable row level security;

create policy "Household members can manage splits"
  on expense_splits for all
  using (
    expense_id in (
      select id from expenses
      where is_household_member(household_id)
    )
  );

-- ─── Bills ───────────────────────────────────────────────────────────────────
create table bills (
  id            uuid primary key default uuid_generate_v4(),
  household_id  uuid not null references households(id) on delete cascade,
  name          text not null,
  icon          text not null default '📄',
  amount        numeric(10,2) not null check (amount > 0),
  due_date      date not null,
  status        text not null default 'pending' check (status in ('paid','pending','overdue')),
  recurring     text not null default 'monthly' check (recurring in ('monthly','weekly','yearly','once')),
  paid_at       timestamptz,
  created_at    timestamptz not null default now()
);

alter table bills enable row level security;

create policy "Household members can manage bills"
  on bills for all
  using (
    is_household_member(household_id)
  );

-- ─── Settlements ─────────────────────────────────────────────────────────────
create table settlements (
  id              uuid primary key default uuid_generate_v4(),
  household_id    uuid not null references households(id) on delete cascade,
  from_member_id  uuid not null references members(id),
  to_member_id    uuid not null references members(id),
  amount          numeric(10,2) not null,
  note            text,
  settled_at      timestamptz not null default now()
);

alter table settlements enable row level security;

create policy "Household members can view settlements"
  on settlements for select
  using (
    is_household_member(household_id)
  );

create policy "Household members can create settlements"
  on settlements for insert
  with check (
    is_household_member(household_id)
  );

-- ─── Wallet Transactions ──────────────────────────────────────────────────────
create table wallet_transactions (
  id            uuid primary key default uuid_generate_v4(),
  household_id  uuid not null references households(id) on delete cascade,
  member_id     uuid not null references members(id),
  amount        numeric(10,2) not null, -- positive = deposit, negative = withdrawal
  description   text not null,
  created_at    timestamptz not null default now()
);

alter table wallet_transactions enable row level security;

create policy "Household members can manage wallet"
  on wallet_transactions for all
  using (
    is_household_member(household_id)
  );

-- ─── Seed Default Categories Function ────────────────────────────────────────
-- Call this after creating a household: select seed_default_categories('<household_id>');

create or replace function seed_default_categories(p_household_id uuid)
returns void language plpgsql as $$
begin
  insert into categories (household_id, name, icon, color, budget_limit, is_grocery) values
    (p_household_id, 'Rent',               '🏠', '#2B4C7E', null,   false),
    (p_household_id, 'Groceries',          '🛒', '#2D5F3F', 500.00, true),
    (p_household_id, 'Utilities',          '⚡', '#E8A020', 200.00, false),
    (p_household_id, 'Internet',           '🌐', '#7B5EA7', 80.00,  false),
    (p_household_id, 'Subscriptions',      '📱', '#C84B31', 120.00, false),
    (p_household_id, 'Household Supplies', '🧹', '#5A8A6A', 100.00, false),
    (p_household_id, 'Eating Out',         '🍽️', '#D4724E', 200.00, false),
    (p_household_id, 'Health',             '🏥', '#4A90A4', 150.00, false),
    (p_household_id, 'Transport',          '🚗', '#8B7355', 200.00, false),
    (p_household_id, 'Other',              '📦', '#6B6560', null,   false);
end;
$$;

create or replace function create_household_with_admin(
  p_household_name text,
  p_member_name text,
  p_member_email text
)
returns households
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household households;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into households (name, created_by)
  values (p_household_name, auth.uid())
  returning * into v_household;

  insert into members (household_id, user_id, name, email, role)
  values (v_household.id, auth.uid(), p_member_name, p_member_email, 'admin');

  perform seed_default_categories(v_household.id);

  return v_household;
end;
$$;

grant execute on function create_household_with_admin(text, text, text) to authenticated;

create or replace function join_household_with_invite(
  p_invite_code text,
  p_member_name text,
  p_member_email text
)
returns households
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household households;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into v_household
  from households
  where invite_code = upper(trim(p_invite_code))
  limit 1;

  if v_household.id is null then
    raise exception 'INVALID_INVITE_CODE';
  end if;

  insert into members (household_id, user_id, name, email, role)
  values (v_household.id, auth.uid(), p_member_name, p_member_email, 'member')
  on conflict (household_id, user_id)
  do update
    set name = excluded.name,
        email = excluded.email;

  return v_household;
end;
$$;

grant execute on function join_household_with_invite(text, text, text) to authenticated;

-- ─── Auto-update overdue bills ────────────────────────────────────────────────
-- Run this as a scheduled job (e.g. Supabase cron or pg_cron) daily.

create or replace function mark_overdue_bills()
returns void language plpgsql as $$
begin
  update bills
  set status = 'overdue'
  where status = 'pending'
    and due_date < current_date;
end;
$$;

-- ─── Realtime ─────────────────────────────────────────────────────────────────
-- Enable realtime for key tables so all household members see live updates.

alter publication supabase_realtime add table expenses;
alter publication supabase_realtime add table bills;
alter publication supabase_realtime add table expense_splits;
alter publication supabase_realtime add table wallet_transactions;
