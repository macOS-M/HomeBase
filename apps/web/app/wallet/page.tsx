import { AppShell } from '@/components/layout/AppShell';
import { AuthHydrator } from '@/components/layout/AuthHydrator';
import { WalletPageClient } from '@/components/wallet/WalletPageClient';
import { requireHouseholdContext } from '@/lib/household-context';

export default async function WalletPage() {
  const { household, member } = await requireHouseholdContext();

  return (
    <AppShell>
      <AuthHydrator member={member} household={household} />
      <WalletPageClient household={household} member={member} />
    </AppShell>
  );
}
