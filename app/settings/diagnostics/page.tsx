import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import SettingsDiagnosticsClient from './settings-diagnostics-client';

export const metadata = {
  title: 'Device & Sync Diagnostics',
  description: 'Local offline storage and device sync diagnostics',
};

export default async function SettingsDiagnosticsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?redirectTo=/settings/diagnostics');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  return <SettingsDiagnosticsClient user={user} profile={profile} />;
}
