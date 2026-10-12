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

  // 1. Fetch user profile safely
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    // If profile row doesn't exist yet, provide default fallback rather than kicking user out
    const fallbackProfile = {
      id: user.id,
      email: user.email || '',
      full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
      role: 'employee',
      active: true,
      branches: null,
      manager: null,
    };
    return <SettingsClient profile={fallbackProfile} userEmail={user.email || ''} />;
  }

  // 2. Safely fetch branch info without hardcoded relational schemas
  let branchData = null;
  if (profile.branch_id) {
    const { data: b } = await supabase
      .from('branches')
      .select('id, name, code')
      .eq('id', profile.branch_id)
      .maybeSingle();
    branchData = b;
  }

  // 3. Safely fetch manager info
  let managerData = null;
  if (profile.manager_id) {
    const { data: m } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('id', profile.manager_id)
      .maybeSingle();
    managerData = m;
  }

  const enrichedProfile = {
    ...profile,
    branches: branchData,
    manager: managerData,
  };

  return <SettingsClient profile={enrichedProfile} userEmail={user.email || profile.email} />;
}
