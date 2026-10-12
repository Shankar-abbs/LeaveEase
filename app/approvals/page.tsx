import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import ApprovalsClient from './approvals-client';

export const metadata = { title: 'Approvals' };

export default async function ApprovalsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirectTo=/approvals');

  const { data: profile } = await supabase
    .from('profiles').select('*').eq('id', user.id).single();

  if (!profile || !['manager', 'hr_admin'].includes(profile.role)) {
    redirect('/dashboard');
  }

  // Pending requests: manager sees their direct reports, hr_admin sees all
  const pendingQuery = supabase
    .from('leave_requests')
    .select(`
      *,
      profiles!leave_requests_user_id_fkey(full_name, email, branch_id, branches(name)),
      leave_types(code, name)
    `)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (profile.role === 'manager') {
    // Only direct reports — handled by RLS, but add explicit filter
    const { data: directReports } = await supabase
      .from('profiles').select('id').eq('manager_id', user.id);
    const ids = (directReports ?? []).map((p: { id: string }) => p.id);
    if (ids.length > 0) {
      pendingQuery.in('user_id', ids);
    }
  }

  const { data: pendingRequests } = await pendingQuery.limit(50);

  return (
    <ApprovalsClient
      profile={profile}
      initialRequests={pendingRequests ?? []}
    />
  );
}
