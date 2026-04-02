import { AppShell } from '@/components/layout/AppShell';
import { requireHouseholdContext } from '@/lib/household-context';
import dynamic from 'next/dynamic';

const DashboardClient = dynamic(
  () => import('@/components/dashboard/DashboardClient').then((mod) => mod.DashboardClient),
  { ssr: false }
);

export default async function DashboardPage() {
  const { household, member } = await requireHouseholdContext();

  return (
    <AppShell>
      <DashboardClient member={member} household={household} />
    </AppShell>
  );
}
