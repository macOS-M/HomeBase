import { AppShell } from '@/components/layout/AppShell';
import { AuthHydrator } from '@/components/layout/AuthHydrator';
import { createServerClient } from '@/lib/supabase/server';
import { requireHouseholdContext } from '@/lib/household-context';
import { formatCurrency } from '@homebase/utils';

export default async function GroceryPage() {
  const { household, member } = await requireHouseholdContext();
  const supabase = createServerClient();

  const { data: groceryCategory } = await supabase
    .from('categories')
    .select('*')
    .eq('household_id', household.id)
    .eq('is_grocery', true)
    .maybeSingle();

  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const startDate = `${month}-01`;
  const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .split('T')[0];

  const { data: groceryExpenses = [] } = await supabase
    .from('expenses')
    .select('*')
    .eq('household_id', household.id)
    .eq('category_id', groceryCategory?.id)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: false });

  const spent = groceryExpenses.reduce((sum: number, expense: any) => sum + (expense.amount ?? 0), 0);
  const budget = groceryCategory?.budget_limit ?? 0;
  const remaining = Math.max(0, budget - spent);

  return (
    <AppShell>
      <AuthHydrator member={member} household={household} />
      <section className="p-8">
        <h1 className="text-2xl font-semibold text-[#1A1714]">Grocery</h1>
        <p className="text-sm text-[#6B6560] mt-1">Current month grocery budget</p>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Metric label="Budget" value={formatCurrency(budget)} />
          <Metric label="Spent" value={formatCurrency(spent)} />
          <Metric label="Remaining" value={formatCurrency(remaining)} />
        </div>

        <div className="mt-6 bg-white rounded-xl border border-[#E8E2D9] overflow-hidden">
          {groceryExpenses.length === 0 ? (
            <p className="p-6 text-sm text-[#6B6560]">No grocery expenses yet this month.</p>
          ) : (
            <ul className="divide-y divide-[#EFE9E0]">
              {groceryExpenses.map((expense: any) => (
                <li key={expense.id} className="p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-[#1A1714]">{expense.name}</p>
                    <p className="text-xs text-[#6B6560]">{expense.date}</p>
                  </div>
                  <p className="font-semibold text-[#1A1714]">{formatCurrency(expense.amount)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-[#E8E2D9] p-4">
      <p className="text-xs uppercase tracking-wide text-[#6B6560]">{label}</p>
      <p className="text-xl font-semibold text-[#1A1714] mt-1">{value}</p>
    </div>
  );
}
