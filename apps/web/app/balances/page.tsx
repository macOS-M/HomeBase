import { AppShell } from '@/components/layout/AppShell';
import { AuthHydrator } from '@/components/layout/AuthHydrator';
import { BalancesPageClient } from '@/components/balances/BalancesPageClient';
import { requireHouseholdContext } from '@/lib/household-context';

export default async function BalancesPage() {
  const { household, member } = await requireHouseholdContext();

  return (
    <AppShell>
      <AuthHydrator member={member} household={household} />
      <BalancesPageClient household={household} />
    </AppShell>
  );
}
