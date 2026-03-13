import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/layout/AppShell';
import { CategoriesPageClient } from '@/components/categories/CategoriesPageClient';

export default async function CategoriesPage() {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data: member } = await supabase
    .from('members')
    .select('*, household:households(*)')
    .eq('user_id', user.id)
    .single();

  if (!member) redirect('/auth/join');

  return (
    <AppShell>
      <CategoriesPageClient household={member.household} />
    </AppShell>
  );
}