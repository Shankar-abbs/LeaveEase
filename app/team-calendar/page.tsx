import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import TeamCalendarClient from './team-calendar-client';
import { startOfMonth, endOfMonth, addMonths, format } from 'date-fns';

export const metadata = {
  title: 'Team Calendar',
  description: 'View colleague absences and plan team schedules',
};

export default async function TeamCalendarPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?redirectTo=/team-calendar');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  // Load current month and next month leaves
  const now = new Date();
  const from = format(startOfMonth(now), 'yyyy-MM-dd');
  const to = format(endOfMonth(addMonths(now, 1)), 'yyyy-MM-dd');

  const { data: calendarEntries } = await supabase.rpc('team_calendar', {
    p_from: from,
    p_to: to,
  });

  return (
    <TeamCalendarClient
      profile={profile}
      initialEntries={calendarEntries ?? []}
      initialFrom={from}
      initialTo={to}
    />
  );
}
