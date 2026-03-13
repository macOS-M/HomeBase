import { AppShell } from '@/components/layout/AppShell';
import { AuthHydrator } from '@/components/layout/AuthHydrator';
import { CategoriesPageClient } from '@/components/categories/CategoriesPageClient';
import { requireHouseholdContext } from '@/lib/household-context';

export default async function CategoriesPage() {
  const { household, member } = await requireHouseholdContext();

  return (
    <AppShell>
      <AuthHydrator member={member} household={household} />
      <CategoriesPageClient household={household} />
    </AppShell>
  );
}
