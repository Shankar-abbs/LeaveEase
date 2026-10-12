'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseClient } from '@/lib/supabase/client';
import { clientLogger } from '@/lib/client-logger';
import type { User } from '@supabase/supabase-js';
import { displayDate } from '@/lib/dates';
import AppShell from '@/components/AppShell';

interface Balance {
  leave_type_id: string;
  leave_type_code: string;
  leave_type_name: string;
  balance: number;
  pending: number;
  available: number;
}

interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: string;
  branch_id?: string;
  manager_id?: string;
  joined_on: string;
}

interface DashboardClientProps {
  user: User;
  profile: Profile | null;
  initialBalances: Balance[];
}

const LEAVE_TYPE_COLORS: Record<string, string> = {
  CL: 'from-blue-600/30 to-blue-500/10 border-blue-500/30 text-blue-300',
  SL: 'from-purple-600/30 to-purple-500/10 border-purple-500/30 text-purple-300',
  EL: 'from-brand-600/30 to-brand-500/10 border-brand-500/30 text-brand-300',
};

export default function DashboardClient({ user, profile, initialBalances }: DashboardClientProps) {
  const [balances, setBalances] = useState<Balance[]>(initialBalances);
  const [isOnline, setIsOnline] = useState(true);
  const [lastSynced, setLastSynced] = useState<Date>(new Date());
  const [upcomingLeave, setUpcomingLeave] = useState<any[]>([]);
  const router = useRouter();

  const supabase = getSupabaseClient();

  useEffect(() => {
    // Track online status
    const handleOnline = () => {
      setIsOnline(true);
      void refreshBalances();
    };
    const handleOffline = () => setIsOnline(false);

    setIsOnline(navigator.onLine);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Subscribe to realtime balance changes
    const channel = supabase
      .channel('leave-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'leave_requests',
        filter: `user_id=eq.${user.id}`,
      }, () => {
        void refreshBalances();
      })
      .subscribe();

    // Load upcoming leave
    void loadUpcomingLeave();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      void supabase.removeChannel(channel);
    };
  }, []);

  async function refreshBalances() {
    if (!navigator.onLine) return;
    try {
      const { data, error } = await supabase.rpc('get_balances');
      if (error) throw error;
      setBalances(data ?? []);
      setLastSynced(new Date());
      clientLogger.debug('Balances refreshed', { action: 'refresh_balances' });
    } catch (err) {
      clientLogger.error('Failed to refresh balances', err instanceof Error ? err : undefined);
    }
  }

  async function loadUpcomingLeave() {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data } = await supabase
        .from('leave_requests')
        .select('*, leave_types(code, name)')
        .eq('user_id', user.id)
        .in('status', ['pending', 'approved'])
        .gte('end_date', today)
        .order('start_date', { ascending: true })
        .limit(5);
      setUpcomingLeave(data ?? []);
    } catch (err) {
      clientLogger.error('Failed to load upcoming leave', err instanceof Error ? err : undefined);
    }
  }

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <AppShell profile={profile} activeRoute="/dashboard">
      <div className="page-container">
        {/* Offline Banner */}
        {!isOnline && (
          <div className="offline-banner animate-fade-in" role="alert" aria-live="polite">
            📡 You&apos;re offline. Showing cached data. Changes will sync when you reconnect.
          </div>
        )}

        {/* Header */}
        <div className="pt-4 mb-6 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div>
              <p className="text-slate-400 text-sm">{greeting()},</p>
              <h1 className="text-2xl font-bold text-white mt-0.5">
                {profile?.full_name ?? 'there'}
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-brand-400 font-medium capitalize bg-brand-500/10 px-2 py-0.5 rounded-md border border-brand-500/20">
                  {profile?.role?.replace('_', ' ') ?? 'employee'}
                </span>
                <span className="text-xs text-slate-600">•</span>
                <span className="text-xs text-slate-400 font-mono">{profile?.email}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-400 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-full">
                <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                {isOnline ? 'Live' : `Cached · ${lastSynced.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`}
              </span>
            </div>
          </div>
        </div>

        {/* Balance Cards */}
        <div className="mb-6 animate-slide-up" style={{ animationDelay: '0.1s' }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="section-title">Leave Balances</h2>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {balances.map((b) => (
              <div
                key={b.leave_type_id}
                className={`card-glass bg-gradient-to-br ${LEAVE_TYPE_COLORS[b.leave_type_code] ?? 'from-slate-700/30 to-slate-600/10 border-slate-600/30 text-slate-300'} p-4`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="font-semibold text-sm opacity-90">{b.leave_type_name}</span>
                  <span className="text-2xl font-bold">{b.available}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs opacity-75">
                  <div>
                    <div className="font-medium mb-0.5">Total</div>
                    <div>{b.balance}</div>
                  </div>
                  <div>
                    <div className="font-medium mb-0.5">Pending</div>
                    <div>{b.pending}</div>
                  </div>
                  <div>
                    <div className="font-medium mb-0.5">Available</div>
                    <div className="font-bold">{b.available}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Apply Button */}
        <Link
          href="/apply"
          id="apply-leave-btn"
          className="btn-primary w-full mb-6 py-4 text-base rounded-2xl shadow-lg shadow-brand-500/25 animate-slide-up"
          style={{ animationDelay: '0.2s' }}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Apply for Leave
        </Link>

        {/* Upcoming Leave */}
        {upcomingLeave.length > 0 && (
          <div className="animate-slide-up" style={{ animationDelay: '0.3s' }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="section-title">Upcoming Leave</h2>
              <Link href="/history" className="text-brand-400 text-sm hover:text-brand-300">
                View all
              </Link>
            </div>
            <div className="space-y-2">
              {upcomingLeave.map((req) => (
                <div key={req.id} className="card p-4 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-slate-200">
                      {(req.leave_types as any)?.name ?? req.leave_type_id}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {displayDate(req.start_date)} — {displayDate(req.end_date)} · {req.days} day{req.days !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <span className={`badge-${req.status}`}>
                    {req.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {upcomingLeave.length === 0 && balances.length > 0 && (
          <div className="text-center py-8 text-slate-500 animate-fade-in" style={{ animationDelay: '0.3s' }}>
            <svg className="w-10 h-10 mx-auto mb-2 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
            </svg>
            <p className="text-sm">No upcoming leave planned</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
