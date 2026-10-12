import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import AdminClient from './admin-client';

export const metadata = {
  title: 'HR Administration',
  description: 'Manage policies, team members, and generate monthly reports',
};

export default async function AdminPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?redirectTo=/admin');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'hr_admin') {
    redirect('/dashboard');
  }

  // Load policies, branches, and managers
  const [{ data: policy }, { data: branches }, { data: managers }] = await Promise.all([
    supabase.from('policy_settings').select('*').limit(1).single(),
    supabase.from('branches').select('*').order('name'),
    supabase.from('profiles').select('id, full_name, email').in('role', ['manager', 'hr_admin']).order('full_name'),
  ]);

  return (
    <AdminClient
      profile={profile}
      initialPolicy={policy ?? { auto_approve_below_days: 0, weekly_off_days: [0, 6], timezone: 'Asia/Kolkata' }}
      branches={branches ?? []}
      managers={managers ?? []}
    />
  );
}
