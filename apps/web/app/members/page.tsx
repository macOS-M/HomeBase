import { redirect } from 'next/navigation';

export default async function MembersPage() {
  redirect('/settings');
}
