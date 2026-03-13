import { AppShell } from '@/components/layout/AppShell';
import { AuthHydrator } from '@/components/layout/AuthHydrator';
import { BillsPageClient } from '@/components/bills/BillsPageClient';
import { requireHouseholdContext } from '@/lib/household-context';

export default async function BillsPage() {
  const { household, member } = await requireHouseholdContext();

  return (
    <AppShell>
      <AuthHydrator member={member} household={household} />
      <BillsPageClient household={household} />
    </AppShell>
  );
}
