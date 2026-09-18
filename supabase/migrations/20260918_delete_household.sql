-- A deliberate, account-preserving household reset. Deleting a household
-- cascades only its HomeBase data; it does not delete anyone from Supabase Auth.
create or replace function delete_household(
  p_household_id uuid,
  p_confirmation_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household households;
begin
  select * into v_household
  from households
  where id = p_household_id
  for update;

  if not found then
    raise exception 'Household not found.';
  end if;

  if not is_household_admin(p_household_id)
     and v_household.created_by is distinct from auth.uid() then
    raise exception 'Only a household administrator can delete this household.';
  end if;

  if btrim(coalesce(p_confirmation_name, '')) <> v_household.name then
    raise exception 'Enter the exact household name to confirm deletion.';
  end if;

  delete from households where id = p_household_id;
end;
$$;

grant execute on function delete_household(uuid, text) to authenticated;

-- PostgREST normally detects this automatically, but force an immediate refresh
-- so the browser can call the new RPC as soon as this migration finishes.
notify pgrst, 'reload schema';
