-- HomeBase financial-integrity migration
-- Apply this once to an existing database after the base schema.

alter table households
  add column if not exists base_currency text not null default 'USD',
  add column if not exists timezone text not null default 'UTC',
  add column if not exists budget_cycle_start_day integer not null default 1;

alter table households drop constraint if exists households_base_currency_check;
alter table households add constraint households_base_currency_check
  check (base_currency ~ '^[A-Z]{3}$');
alter table households drop constraint if exists households_budget_cycle_start_day_check;
alter table households add constraint households_budget_cycle_start_day_check
  check (budget_cycle_start_day between 1 and 28);

create or replace function prevent_base_currency_change_after_activity()
returns trigger
language plpgsql
as $$
begin
  if old.base_currency <> new.base_currency and (
    exists (select 1 from expenses where household_id = old.id)
    or exists (select 1 from bills where household_id = old.id)
    or exists (select 1 from settlements where household_id = old.id)
  ) then
    raise exception 'Base currency cannot change after financial activity. Create a new household or migrate records with a dedicated conversion.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_base_currency_change_after_activity on households;
create trigger trg_prevent_base_currency_change_after_activity
before update of base_currency on households
for each row execute function prevent_base_currency_change_after_activity();

alter table members
  add column if not exists income_contribution numeric(10,2) not null default 0,
  add column if not exists expense_share_percentage numeric(5,2);

alter table members drop constraint if exists members_income_contribution_check;
alter table members add constraint members_income_contribution_check
  check (income_contribution >= 0);
alter table members drop constraint if exists members_expense_share_percentage_check;
alter table members add constraint members_expense_share_percentage_check
  check (expense_share_percentage is null or expense_share_percentage between 0 and 100);

-- Keep historical rows usable while making the former overloaded column explicit.
update members
set income_contribution = monthly_budget
where income_contribution = 0 and monthly_budget > 0;

with weights as (
  select
    m.id,
    m.household_id,
    row_number() over (partition by m.household_id order by m.joined_at, m.id) as row_number,
    count(*) over (partition by m.household_id) as member_count,
    sum(greatest(m.monthly_budget, 0)) over (partition by m.household_id) as total_weight,
    round(
      greatest(m.monthly_budget, 0) * 100 /
      nullif(sum(greatest(m.monthly_budget, 0)) over (partition by m.household_id), 0),
      2
    ) as rounded_share
  from members m
), shares as (
  select
    id,
    case
      when total_weight > 0 and row_number = 1 then
        100 - sum(rounded_share) over (partition by household_id) + rounded_share
      when total_weight > 0 then rounded_share
      when member_count = 1 then 100
      when row_number = 1 then 100 - round(100::numeric / member_count, 2) * (member_count - 1)
      else round(100::numeric / member_count, 2)
    end as share
  from weights
)
update members m
set expense_share_percentage = shares.share
from shares
where m.id = shares.id and m.expense_share_percentage is null;

alter table bills
  add column if not exists category_id uuid references categories(id) on delete set null,
  add column if not exists paid_by uuid references members(id) on delete restrict,
  add column if not exists series_id uuid not null default uuid_generate_v4();

create index if not exists bills_household_series_idx on bills(household_id, series_id);

alter table settlements
  add column if not exists method text not null default 'legacy';
alter table settlements drop constraint if exists settlements_method_check;
alter table settlements add constraint settlements_method_check
  check (method in ('legacy', 'net_settlement'));
alter table settlements drop constraint if exists settlements_positive_amount_check;
alter table settlements add constraint settlements_positive_amount_check
  check (amount > 0);
alter table settlements drop constraint if exists settlements_distinct_members_check;
alter table settlements add constraint settlements_distinct_members_check
  check (from_member_id <> to_member_id);

alter table expense_splits drop constraint if exists expense_splits_nonnegative_amount_check;
alter table expense_splits add constraint expense_splits_nonnegative_amount_check
  check (amount >= 0);

alter table expenses
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references members(id) on delete set null,
  add column if not exists void_reason text;

create or replace function assert_expense_member_and_category_match_household()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from members
    where id = new.paid_by and household_id = new.household_id
  ) then
    raise exception 'Expense payer must be a member of the expense household.';
  end if;

  if new.category_id is not null and not exists (
    select 1 from categories
    where id = new.category_id and household_id = new.household_id
  ) then
    raise exception 'Expense category must belong to the expense household.';
  end if;

  if new.source_bill_id is not null and not exists (
    select 1 from bills
    where id = new.source_bill_id and household_id = new.household_id
  ) then
    raise exception 'Source bill must belong to the expense household.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_expense_household_integrity on expenses;
create trigger trg_expense_household_integrity
before insert or update of household_id, paid_by, category_id, source_bill_id
on expenses
for each row execute function assert_expense_member_and_category_match_household();

create or replace function assert_split_member_matches_expense_household()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from expenses e
    join members m on m.id = new.member_id
    where e.id = new.expense_id and m.household_id = e.household_id
  ) then
    raise exception 'Expense split member must belong to the expense household.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_split_household_integrity on expense_splits;
create trigger trg_split_household_integrity
before insert or update of expense_id, member_id
on expense_splits
for each row execute function assert_split_member_matches_expense_household();

create or replace function assert_bill_member_and_category_match_household()
returns trigger
language plpgsql
as $$
begin
  if new.paid_by is not null and not exists (
    select 1 from members where id = new.paid_by and household_id = new.household_id
  ) then
    raise exception 'Bill payer must be a member of the bill household.';
  end if;
  if new.category_id is not null and not exists (
    select 1 from categories where id = new.category_id and household_id = new.household_id
  ) then
    raise exception 'Bill category must belong to the bill household.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bill_household_integrity on bills;
create trigger trg_bill_household_integrity
before insert or update of household_id, paid_by, category_id
on bills
for each row execute function assert_bill_member_and_category_match_household();

create or replace function prevent_paid_bill_deletion()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'paid' then
    raise exception 'Paid bill occurrences are financial history and cannot be deleted.';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_prevent_paid_bill_deletion on bills;
create trigger trg_prevent_paid_bill_deletion
before delete on bills
for each row execute function prevent_paid_bill_deletion();

-- Financial ledgers can be read directly, but are written only through the
-- validated functions below. This prevents an API client from inventing a split
-- total or mutating historical reimbursement data.
drop policy if exists "Household members can manage expenses" on expenses;
drop policy if exists "Household members can view expenses" on expenses;
create policy "Household members can view expenses"
  on expenses for select using (is_household_member(household_id));
drop policy if exists "Household members can manage splits" on expense_splits;
drop policy if exists "Household members can view splits" on expense_splits;
create policy "Household members can view splits"
  on expense_splits for select using (
    expense_id in (select id from expenses where is_household_member(household_id))
  );
drop policy if exists "Household members can create settlements" on settlements;
drop policy if exists "Household members can manage bills" on bills;
drop policy if exists "Household members can view bills" on bills;
drop policy if exists "Household members can schedule bills" on bills;
drop policy if exists "Household members can remove pending bills" on bills;
create policy "Household members can view bills"
  on bills for select using (is_household_member(household_id));
create policy "Household members can schedule bills"
  on bills for insert with check (
    is_household_member(household_id) and status = 'pending'
  );
create policy "Household members can remove pending bills"
  on bills for delete using (
    is_household_member(household_id) and status <> 'paid'
  );

-- Keep the household plan and every member's contribution/share in one
-- transaction. The UI never has to make a sequence of partial settings writes.
create or replace function configure_financial_plan(
  p_household_id uuid,
  p_monthly_income numeric,
  p_base_currency text,
  p_cycle_start_day integer,
  p_default_split_type text,
  p_members jsonb
)
returns households
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household households;
  v_member_count integer;
  v_input_count integer;
  v_distinct_input_count integer;
  v_contribution_total numeric;
  v_share_total numeric;
begin
  select * into v_household from households where id = p_household_id for update;
  if not found then raise exception 'Household not found.'; end if;
  if not is_household_admin(p_household_id) and v_household.created_by is distinct from auth.uid() then
    raise exception 'Only a household administrator can change the financial plan.';
  end if;
  if p_monthly_income is null or p_monthly_income < 0 then
    raise exception 'Planned income must be zero or greater.';
  end if;
  if upper(coalesce(p_base_currency, '')) !~ '^[A-Z]{3}$' then
    raise exception 'Base currency must be a three-letter ISO code.';
  end if;
  if p_cycle_start_day not between 1 and 28 then
    raise exception 'Budget cycle start day must be between 1 and 28.';
  end if;
  if p_default_split_type not in ('equal', 'percentage') then
    raise exception 'Split type is invalid.';
  end if;
  if coalesce(jsonb_typeof(p_members), '') <> 'array' then
    raise exception 'Member financial settings are required.';
  end if;

  select count(*) into v_member_count from members where household_id = p_household_id;
  select
    count(*),
    count(distinct (item->>'id')::uuid),
    coalesce(sum((item->>'income_contribution')::numeric), 0),
    coalesce(sum((item->>'expense_share_percentage')::numeric), 0)
  into v_input_count, v_distinct_input_count, v_contribution_total, v_share_total
  from jsonb_array_elements(p_members) item;

  if v_input_count <> v_member_count or v_distinct_input_count <> v_member_count then
    raise exception 'Financial settings must include each household member exactly once.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_members) item
    where (item->>'income_contribution')::numeric < 0
       or (item->>'expense_share_percentage')::numeric < 0
       or (item->>'expense_share_percentage')::numeric > 100
       or not exists (
         select 1 from members m
         where m.id = (item->>'id')::uuid and m.household_id = p_household_id
       )
  ) then
    raise exception 'Every contribution and expense share must belong to this household and be valid.';
  end if;
  if abs(v_contribution_total - p_monthly_income) > 0.01 then
    raise exception 'Member contributions must equal planned income.';
  end if;
  if abs(v_share_total - 100) > 0.01 then
    raise exception 'Member expense shares must total 100%%.';
  end if;

  update households
  set monthly_income = round(p_monthly_income, 2),
      base_currency = upper(p_base_currency),
      budget_period = 'monthly',
      budget_cycle_start_day = p_cycle_start_day,
      default_split_type = p_default_split_type
  where id = p_household_id
  returning * into v_household;

  update members m
  set income_contribution = round((item->>'income_contribution')::numeric, 2),
      expense_share_percentage = round((item->>'expense_share_percentage')::numeric, 2)
  from jsonb_array_elements(p_members) item
  where m.id = (item->>'id')::uuid and m.household_id = p_household_id;

  return v_household;
end;
$$;

grant execute on function configure_financial_plan(uuid, numeric, text, integer, text, jsonb) to authenticated;

-- The only supported write path for an expense and its shares. It validates the
-- complete document and saves both tables in one database transaction.
create or replace function create_expense_with_splits(
  p_household_id uuid,
  p_expense jsonb,
  p_splits jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expense expenses;
  v_amount numeric(10,2);
  v_split_total numeric(10,2);
  v_split_count integer;
begin
  if not is_household_member(p_household_id) then
    raise exception 'Not a member of this household.';
  end if;

  v_amount := (p_expense->>'amount')::numeric;
  if v_amount is null or v_amount <= 0 then
    raise exception 'Expense amount must be greater than zero.';
  end if;

  select count(*), coalesce(sum((item->>'amount')::numeric), 0)
  into v_split_count, v_split_total
  from jsonb_array_elements(coalesce(p_splits, '[]'::jsonb)) item;

  if v_split_count = 0 or abs(v_split_total - v_amount) > 0.01 then
    raise exception 'Expense splits must total the expense amount.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_splits) item
    where coalesce((item->>'amount')::numeric, -1) < 0
       or not exists (
         select 1 from members m
         where m.id = (item->>'member_id')::uuid and m.household_id = p_household_id
       )
  ) then
    raise exception 'Every split must be non-negative and belong to this household.';
  end if;

  insert into expenses (
    household_id, name, amount, original_amount, currency_code, fx_rate,
    source_type, source_bill_id, category_id, paid_by, split_type, date,
    receipt_url, receipt_items, notes
  ) values (
    p_household_id,
    nullif(trim(p_expense->>'name'), ''),
    v_amount,
    coalesce((p_expense->>'original_amount')::numeric, v_amount),
    coalesce(upper(p_expense->>'currency_code'), 'USD'),
    coalesce((p_expense->>'fx_rate')::numeric, 1),
    coalesce(p_expense->>'source_type', 'manual'),
    nullif(p_expense->>'source_bill_id', '')::uuid,
    nullif(p_expense->>'category_id', '')::uuid,
    (p_expense->>'paid_by')::uuid,
    coalesce(p_expense->>'split_type', 'equal'),
    coalesce((p_expense->>'date')::date, current_date),
    nullif(p_expense->>'receipt_url', ''),
    p_expense->'receipt_items',
    nullif(p_expense->>'notes', '')
  ) returning * into v_expense;

  insert into expense_splits (expense_id, member_id, amount, percentage, is_settled)
  select
    v_expense.id,
    (item->>'member_id')::uuid,
    (item->>'amount')::numeric,
    nullif(item->>'percentage', '')::numeric,
    false
  from jsonb_array_elements(p_splits) item;

  return to_jsonb(v_expense);
end;
$$;

grant execute on function create_expense_with_splits(uuid, jsonb, jsonb) to authenticated;

create or replace function void_expense(p_expense_id uuid, p_reason text default null)
returns expenses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expense expenses;
  v_member_id uuid;
begin
  select * into v_expense from expenses where id = p_expense_id for update;
  if not found then raise exception 'Expense not found.'; end if;
  if not is_household_member(v_expense.household_id) then raise exception 'Not a member of this household.'; end if;
  if v_expense.source_type = 'bill' then
    raise exception 'Bill payments are immutable. Record a correcting expense instead.';
  end if;
  if v_expense.voided_at is not null then return v_expense; end if;
  select id into v_member_id from members where household_id = v_expense.household_id and user_id = auth.uid();
  update expenses
  set voided_at = now(), voided_by = v_member_id, void_reason = nullif(trim(p_reason), '')
  where id = p_expense_id
  returning * into v_expense;
  return v_expense;
end;
$$;

grant execute on function void_expense(uuid, text) to authenticated;

-- Pay a bill, write its expense, create all shares, and create the next
-- occurrence as one transaction. `bills` is now an occurrence ledger; series_id
-- groups recurring occurrences without mutating paid history.
create or replace function record_bill_payment(p_bill_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bill bills;
  v_expense expenses;
  v_default_split_type text;
  v_member record;
  v_member_count integer;
  v_share_total numeric;
  v_index integer := 0;
  v_first_member_id uuid;
  v_split_amount numeric(10,2);
  v_split_total numeric(10,2) := 0;
  v_next_due date;
  v_target_month date;
begin
  select * into v_bill from bills where id = p_bill_id for update;
  if not found then raise exception 'Bill not found.'; end if;
  if not is_household_member(v_bill.household_id) then raise exception 'Not a member of this household.'; end if;
  if v_bill.status = 'paid' then raise exception 'This bill has already been paid.'; end if;
  if v_bill.category_id is null or v_bill.paid_by is null then
    raise exception 'A category and payer are required before paying a bill.';
  end if;
  if v_bill.recurring <> 'once' and v_bill.due_date > current_date + 7 then
    raise exception 'Recurring bills can be paid within seven days of their due date.';
  end if;

  select default_split_type into v_default_split_type from households where id = v_bill.household_id;
  select count(*), coalesce(sum(expense_share_percentage), 0)
  into v_member_count, v_share_total
  from members where household_id = v_bill.household_id;
  if v_member_count = 0 then raise exception 'No household members available for bill split.'; end if;
  if v_default_split_type = 'percentage' and abs(v_share_total - 100) > 0.01 then
    raise exception 'Member expense shares must total 100%% before paying a bill.';
  end if;

  update bills set status = 'paid', paid_at = now() where id = v_bill.id;

  insert into expenses (
    household_id, name, amount, original_amount, currency_code, fx_rate,
    source_type, source_bill_id, category_id, paid_by, split_type, date
  ) values (
    v_bill.household_id, v_bill.name, v_bill.amount,
    coalesce(v_bill.original_amount, v_bill.amount), v_bill.currency_code,
    v_bill.fx_rate, 'bill', v_bill.id, v_bill.category_id, v_bill.paid_by,
    case when v_default_split_type = 'percentage' then 'percentage' else 'equal' end,
    current_date
  ) returning * into v_expense;

  for v_member in
    select id, coalesce(expense_share_percentage, 0) as expense_share_percentage
    from members where household_id = v_bill.household_id order by joined_at, id
  loop
    v_index := v_index + 1;
    if v_default_split_type = 'percentage' then
      v_split_amount := round(v_bill.amount * v_member.expense_share_percentage / 100, 2);
    elsif v_index = 1 then
      v_split_amount := v_bill.amount - floor(v_bill.amount / v_member_count * 100) / 100 * (v_member_count - 1);
    else
      v_split_amount := floor(v_bill.amount / v_member_count * 100) / 100;
    end if;
    if v_index = 1 then v_first_member_id := v_member.id; end if;
    v_split_total := v_split_total + v_split_amount;
    insert into expense_splits (expense_id, member_id, amount, percentage, is_settled)
    values (
      v_expense.id, v_member.id, v_split_amount,
      case when v_default_split_type = 'percentage' then v_member.expense_share_percentage else round(v_split_amount * 100 / v_bill.amount, 2) end,
      false
    );
  end loop;

  if abs(v_bill.amount - v_split_total) >= 0.01 then
    update expense_splits
    set amount = amount + (v_bill.amount - v_split_total)
    where expense_id = v_expense.id and member_id = v_first_member_id;
  end if;

  if v_bill.recurring <> 'once' then
    if v_bill.recurring = 'weekly' then
      v_next_due := v_bill.due_date + 7;
    elsif v_bill.recurring = 'yearly' then
      v_next_due := make_date(
        extract(year from v_bill.due_date)::integer + 1,
        extract(month from v_bill.due_date)::integer,
        least(
          extract(day from v_bill.due_date)::integer,
          extract(day from (make_date(extract(year from v_bill.due_date)::integer + 1, extract(month from v_bill.due_date)::integer, 1) + interval '1 month - 1 day'))::integer
        )
      );
    else
      v_target_month := (date_trunc('month', v_bill.due_date) + interval '1 month')::date;
      v_next_due := v_target_month + least(
        extract(day from v_bill.due_date)::integer,
        extract(day from (v_target_month + interval '1 month - 1 day'))::integer
      ) - 1;
    end if;

    insert into bills (
      household_id, name, icon, amount, original_amount, currency_code, fx_rate,
      category_id, paid_by, series_id, due_date, status, recurring
    ) values (
      v_bill.household_id, v_bill.name, v_bill.icon, v_bill.amount,
      v_bill.original_amount, v_bill.currency_code, v_bill.fx_rate,
      v_bill.category_id, v_bill.paid_by, v_bill.series_id, v_next_due, 'pending', v_bill.recurring
    );
  end if;

  return jsonb_build_object('bill_id', v_bill.id, 'expense_id', v_expense.id);
end;
$$;

grant execute on function record_bill_payment(uuid) to authenticated;

-- A settlement is an immutable reimbursement payment. It adjusts member net
-- positions; it does not mark unrelated or historical expense rows as settled.
create or replace function record_net_settlement(
  p_household_id uuid,
  p_from_member_id uuid,
  p_to_member_id uuid,
  p_amount numeric,
  p_note text default null
)
returns settlements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from_net numeric := 0;
  v_to_net numeric := 0;
  v_settlement settlements;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Settlement amount must be greater than zero.';
  end if;
  if p_from_member_id = p_to_member_id then
    raise exception 'A settlement must have two different members.';
  end if;
  if not is_household_member(p_household_id) then
    raise exception 'Not a member of this household.';
  end if;
  if not exists (select 1 from members where id = p_from_member_id and household_id = p_household_id)
     or not exists (select 1 from members where id = p_to_member_id and household_id = p_household_id) then
    raise exception 'Settlement members must belong to this household.';
  end if;

  -- Serialize settlements for a household so two concurrent payment clicks
  -- cannot both consume the same outstanding balance.
  perform 1 from households where id = p_household_id for update;

  with movements as (
    select s.member_id as member_id, -s.amount as amount
    from expense_splits s
    join expenses e on e.id = s.expense_id
    where e.household_id = p_household_id and s.is_settled = false and s.member_id <> e.paid_by
    union all
    select e.paid_by, s.amount
    from expense_splits s
    join expenses e on e.id = s.expense_id
    where e.household_id = p_household_id and s.is_settled = false and s.member_id <> e.paid_by
    union all
    select from_member_id, amount
    from settlements
    where household_id = p_household_id and method = 'net_settlement'
    union all
    select to_member_id, -amount
    from settlements
    where household_id = p_household_id and method = 'net_settlement'
  )
  select
    coalesce(sum(amount) filter (where member_id = p_from_member_id), 0),
    coalesce(sum(amount) filter (where member_id = p_to_member_id), 0)
  into v_from_net, v_to_net
  from movements;

  if v_from_net >= -0.005 or v_to_net <= 0.005 then
    raise exception 'This reimbursement is no longer outstanding.';
  end if;
  if p_amount > least(-v_from_net, v_to_net) + 0.005 then
    raise exception 'Settlement exceeds the outstanding net balance.';
  end if;

  insert into settlements (household_id, from_member_id, to_member_id, amount, note, method)
  values (p_household_id, p_from_member_id, p_to_member_id, round(p_amount, 2), nullif(trim(p_note), ''), 'net_settlement')
  returning * into v_settlement;

  return v_settlement;
end;
$$;

grant execute on function record_net_settlement(uuid, uuid, uuid, numeric, text) to authenticated;
