import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';

export async function requireHouseholdContext() {
  const supabase = createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  const { data: member } = await supabase
    .from('members')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (!member) {
    redirect('/auth/join');
  }

  const { data: household } = await supabase
    .from('households')
    .select('*')
    .eq('id', member.household_id)
    .single();

  if (!household) {
    redirect('/auth/join');
  }

  return { user, member, household };
}
