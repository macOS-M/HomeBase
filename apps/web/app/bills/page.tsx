import { AppShell } from '@/components/layout/AppShell';
import { AuthHydrator } from '@/components/layout/AuthHydrator';
import { requireHouseholdContext } from '@/lib/household-context';
import dynamic from 'next/dynamic';

const BillsPageClient = dynamic(
  () => import('@/components/bills/BillsPageClient').then((mod) => mod.BillsPageClient),
  { ssr: false }
);

export default async function BillsPage() {
  const { household, member } = await requireHouseholdContext();

  return (
    <AppShell>
      <AuthHydrator member={member} household={household} />
      <BillsPageClient household={household} />
    </AppShell>
  );
}
