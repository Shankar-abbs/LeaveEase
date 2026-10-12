import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import AdminDiagnosticsClient from './admin-diagnostics-client';

export const metadata = {
  title: 'System Diagnostics',
  description: 'HR diagnostics, system logs, and health observability',
};

export default async function AdminDiagnosticsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?redirectTo=/admin/diagnostics');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'hr_admin') {
    redirect('/dashboard');
  }

  // Preload recent logs from app_logs
  const { data: recentLogs } = await supabase
    .from('app_logs')
    .select('*')
    .order('at', { ascending: false })
    .limit(50);

  return (
    <AdminDiagnosticsClient
      profile={profile}
      initialLogs={recentLogs ?? []}
    />
  );
}
