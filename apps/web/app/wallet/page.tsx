import { AppShell } from '@/components/layout/AppShell';
import { AuthHydrator } from '@/components/layout/AuthHydrator';
import { requireHouseholdContext } from '@/lib/household-context';
import dynamic from 'next/dynamic';

const WalletPageClient = dynamic(
  () => import('@/components/wallet/WalletPageClient').then((mod) => mod.WalletPageClient),
  { ssr: false }
);

export default async function WalletPage() {
  const { household, member } = await requireHouseholdContext();

  return (
    <AppShell>
      <AuthHydrator member={member} household={household} />
      <WalletPageClient household={household} member={member} />
    </AppShell>
  );
}
