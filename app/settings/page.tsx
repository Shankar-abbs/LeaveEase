import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import SettingsClient from './settings-client';

export const metadata = {
  title: 'Account Settings | LeaveEase',
  description: 'Manage your profile and update your password',
};

export default async function SettingsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?redirectTo=/settings');
  }

  // Fetch full profile with branch and manager details
  const { data: profile } = await supabase
    .from('profiles')
    .select(`
      id,
      email,
      full_name,
      role,
      active,
      joined_on,
      branch_id,
      manager_id,
      branches (id, name, code, city),
      manager:profiles!manager_id (id, full_name, email)
    `)
    .eq('id', user.id)
    .single();

  if (!profile) {
    redirect('/login');
  }

  return <SettingsClient profile={profile} userEmail={user.email || profile.email} />;
}
