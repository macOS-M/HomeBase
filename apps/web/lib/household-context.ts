import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { isRedirectError } from 'next/dist/client/components/redirect';

export async function requireHouseholdContext() {
  const supabase = createServerClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  const { data: memberWithHousehold } = await supabase
    .from('members')
    .select('*, household:households(*)')
    .eq('user_id', user.id)
    .single();

  const member = memberWithHousehold as any;

  if (!member || !member.household) {
    redirect('/auth/join');
  }

  return { user, member, household: member.household };
}