import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import HistoryClient from './history-client';

export const metadata = { title: 'Leave History' };

export default async function HistoryPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login?redirectTo=/history');

  const { data: profile } = await supabase
    .from('profiles').select('*').eq('id', user.id).single();

  const { data: requests } = await supabase
    .from('leave_requests')
    .select('*, leave_types(code, name)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  return <HistoryClient profile={profile} initialRequests={requests ?? []} />;
}
