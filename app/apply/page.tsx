import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import ApplyPageClient from './apply-client';

export const metadata = { title: 'Apply for Leave' };

export default async function ApplyPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login?redirectTo=/apply');

  const [
    { data: profile },
    { data: leaveTypes },
    { data: balances },
    { data: policy },
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('leave_types').select('*').order('code'),
    supabase.rpc('get_balances'),
    supabase.from('policy_settings').select('weekly_off_days').single(),
  ]);

  return (
    <ApplyPageClient
      profile={profile}
      leaveTypes={leaveTypes ?? []}
      balances={balances ?? []}
      weeklyOffDays={policy?.weekly_off_days ?? [0, 6]}
    />
  );
}
