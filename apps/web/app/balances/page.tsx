import { AppShell } from '@/components/layout/AppShell';
import { AuthHydrator } from '@/components/layout/AuthHydrator';
import { requireHouseholdContext } from '@/lib/household-context';
import dynamic from 'next/dynamic';

const BalancesPageClient = dynamic(
  () => import('@/components/balances/BalancesPageClient').then((mod) => mod.BalancesPageClient),
  { ssr: false }
);

export default async function BalancesPage() {
  const { household, member } = await requireHouseholdContext();

  return (
    <AppShell>
      <AuthHydrator member={member} household={household} />
      <BalancesPageClient household={household} />
    </AppShell>
  );
}
