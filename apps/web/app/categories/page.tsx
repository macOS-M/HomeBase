import { AppShell } from '@/components/layout/AppShell';
import { AuthHydrator } from '@/components/layout/AuthHydrator';
import { requireHouseholdContext } from '@/lib/household-context';
import dynamic from 'next/dynamic';

const CategoriesPageClient = dynamic(
  () => import('@/components/categories/CategoriesPageClient').then((mod) => mod.CategoriesPageClient),
  { ssr: false }
);

export default async function CategoriesPage() {
  const { household, member } = await requireHouseholdContext();

  return (
    <AppShell>
      <AuthHydrator member={member} household={household} />
      <CategoriesPageClient household={household} />
    </AppShell>
  );
}
