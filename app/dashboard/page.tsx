import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import DashboardClient from './dashboard-client';

export const metadata = {
  title: 'Dashboard',
};

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?redirectTo=/dashboard');
  }

  // Fetch initial data server-side
  const [{ data: profile }, { data: balancesRaw }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.rpc('get_balances'),
  ]);

  return (
    <DashboardClient
      user={user}
      profile={profile}
      initialBalances={balancesRaw ?? []}
    />
  );
}
