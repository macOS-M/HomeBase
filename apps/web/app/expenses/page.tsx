import { AppShell } from '@/components/layout/AppShell';
import { AuthHydrator } from '@/components/layout/AuthHydrator';
import { requireHouseholdContext } from '@/lib/household-context';
import dynamic from 'next/dynamic';

const ExpensesPageClient = dynamic(
  () => import('@/components/expenses/ExpensesPageClient').then((mod) => mod.ExpensesPageClient),
  { ssr: false }
);

export default async function ExpensesPage() {
  const { household, member } = await requireHouseholdContext();

  return (
    <AppShell>
      <AuthHydrator member={member} household={household} />
      <ExpensesPageClient household={household} member={member} />
    </AppShell>
  );
}
