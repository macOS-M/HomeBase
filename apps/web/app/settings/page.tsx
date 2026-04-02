import { AppShell } from '@/components/layout/AppShell';
import { AuthHydrator } from '@/components/layout/AuthHydrator';
import { SettingsPageClient } from '@/components/settings/SettingsPageClient';
import { createServerClient } from '@/lib/supabase/server';
import { requireHouseholdContext } from '@/lib/household-context';
import type { Member as HouseholdMember } from '@homebase/types';

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
