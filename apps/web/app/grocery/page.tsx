import { AppShell } from '@/components/layout/AppShell';
import { AuthHydrator } from '@/components/layout/AuthHydrator';
import { GroceryListClient } from '@/components/grocery/GroceryListClient';
import { createServerClient } from '@/lib/supabase/server';
import { requireHouseholdContext } from '@/lib/household-context';
import { formatCurrency } from '@homebase/utils';

function toLocalISODate(input: Date) {
  const offsetMs = input.getTimezoneOffset() * 60 * 1000;
  return new Date(input.getTime() - offsetMs).toISOString().split('T')[0];
}

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
  const endDate = toLocalISODate(new Date(now.getFullYear(), now.getMonth() + 1, 0));

  const { data: groceryExpenses = [] } = await supabase
    .from('expenses')
    .select('*')
    .eq('household_id', household.id)
    .eq('category_id', groceryCategory?.id)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: false });

  const suggestions: string[] = Array.from(
    new Set(
      groceryExpenses
        .map((expense: any) => String(expense.name ?? '').trim())
        .filter(Boolean)
    )
  );

  return (
    <AppShell>
      <AuthHydrator member={member} household={household} />
      <section className="min-h-screen bg-[#0E0F11] text-[#F0EDE8] p-8">
        <h1 className="text-2xl font-semibold text-[#F0EDE8]">Grocery List</h1>
        <p className="text-sm text-[#6B6560] mt-1">Track what your household needs to buy next.</p>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-6 items-start">
          <GroceryListClient
            householdId={household.id}
            suggestions={suggestions}
            groceryCategoryId={groceryCategory?.id}
            defaultSplitType={household.default_split_type === 'percentage' ? 'percentage' : 'equal'}
            currentMemberId={member.id}
          />

          <div className="bg-[#161719] rounded-2xl border border-[rgba(255,255,255,0.06)] overflow-hidden">
            <div className="px-4 py-3 border-b border-[rgba(255,255,255,0.05)]">
              <h2 className="text-sm font-semibold text-[#F0EDE8]">Recent grocery purchases</h2>
              <p className="text-xs text-[#6B6560] mt-0.5">From this month expenses</p>
            </div>
          {groceryExpenses.length === 0 ? (
            <p className="p-6 text-sm text-[#6B6560]">No grocery expenses yet this month.</p>
          ) : (
            <ul className="divide-y divide-[rgba(255,255,255,0.04)]">
              {groceryExpenses.slice(0, 12).map((expense: any) => (
                <li key={expense.id} className="p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-[#F0EDE8]">{expense.name}</p>
                    <p className="text-xs text-[#6B6560]">{expense.date}</p>
                  </div>
                  <p className="font-semibold text-[#C8C4BF]">{formatCurrency(expense.amount)}</p>
                </li>
              ))}
            </ul>
          )}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
