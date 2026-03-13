import { AppShell } from '@/components/layout/AppShell';
import { AuthHydrator } from '@/components/layout/AuthHydrator';
import { ExpensesPageClient } from '@/components/expenses/ExpensesPageClient';
import { requireHouseholdContext } from '@/lib/household-context';

export default async function ExpensesPage() {
  const { household, member } = await requireHouseholdContext();

  return (
    <AppShell>
      <AuthHydrator member={member} household={household} />
      <ExpensesPageClient household={household} member={member} />
    </AppShell>
  );
}
