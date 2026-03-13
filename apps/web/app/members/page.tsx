import { AppShell } from '@/components/layout/AppShell';
import { AuthHydrator } from '@/components/layout/AuthHydrator';
import { MembersSettingsClient } from '@/components/members/MembersSettingsClient';
import { createServerClient } from '@/lib/supabase/server';
import { requireHouseholdContext } from '@/lib/household-context';
import type { Member as HouseholdMember } from '@homebase/types';

export default async function MembersPage() {
  const { household, member } = await requireHouseholdContext();
  const supabase = createServerClient();

  const { data: members, error } = await supabase
    .from('members')
    .select('*')
    .eq('household_id', household.id)
    .order('joined_at', { ascending: true });

  const membersList = members ?? [];

  return (
    <AppShell>
      <AuthHydrator member={member} household={household} />
      {error ? (
        <section className="p-8">
          <p className="text-sm text-[#C84B31]">Unable to load members: {error.message}</p>
        </section>
      ) : (
        <MembersSettingsClient household={household} members={membersList as HouseholdMember[]} />
      )}
    </AppShell>
  );
}
