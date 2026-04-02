import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';

export default async function RootPage() {
  const supabase = createServerClient();
  let user = null;

  try {
    const {
      data: { user: resolvedUser },
    } = await supabase.auth.getUser();
    user = resolvedUser;
  } catch {
    redirect('/auth/login');
  }

  if (user) {
    redirect('/dashboard');
  } else {
    redirect('/auth/login');
  }
}
