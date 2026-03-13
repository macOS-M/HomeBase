import { AppShell } from '@/components/layout/AppShell';
import { DashboardClient } from '@/components/dashboard/DashboardClient';
import { createServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const supabase = createServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data: member } = await supabase
    .from('members')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (!member) redirect('/auth/join');

  const { data: household } = await supabase
    .from('households')
    .select('*')
    .eq('id', member.household_id)
    .single();

  if (!household) redirect('/auth/join');

  return (
    <AppShell>
      <DashboardClient member={member} household={household} />
    </AppShell>
  );
}
