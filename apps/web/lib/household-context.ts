import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';

export async function requireHouseholdContext() {
  const supabase = createServerClient();

  try {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      redirect('/auth/login');
    }

    const user = session.user;

    const { data: memberWithHousehold } = await supabase
      .from('members')
      .select('*, household:households(*)')
      .eq('user_id', user.id)
      .single();

    const member = memberWithHousehold as any;

    if (!member) {
      redirect('/auth/join');
    }

    const household = member.household;

    if (!household) {
      redirect('/auth/join');
    }

    return { user, member, household };
  } catch {
    redirect('/auth/login');
  }
}
