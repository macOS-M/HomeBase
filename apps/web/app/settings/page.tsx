import { AppShell } from '@/components/layout/AppShell';
import { AuthHydrator } from '@/components/layout/AuthHydrator';
import { createServerClient } from '@/lib/supabase/server';
import { requireHouseholdContext } from '@/lib/household-context';
import type { Member as HouseholdMember } from '@homebase/types';
import dynamic from 'next/dynamic';

const SettingsPageClient = dynamic(
  () => import('@/components/settings/SettingsPageClient').then((mod) => mod.SettingsPageClient),
  { ssr: false }
);

export default async function SettingsPage() {
  const { household, member } = await requireHouseholdContext();
  const supabase = createServerClient();

  const { data: members } = await supabase
    .from('members')
    .select('*')
    .eq('household_id', household.id)
    .order('joined_at', { ascending: true });

  return (
    <AppShell>
      <AuthHydrator member={member} household={household} />
      <SettingsPageClient household={household} members={(members ?? []) as HouseholdMember[]} />
    </AppShell>
  );
}
