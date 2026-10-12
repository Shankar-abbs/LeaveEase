'use client';

import { useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { clientLogger } from '@/lib/client-logger';
import AppShell from '@/components/AppShell';
import { displayDate, displayDateRange } from '@/lib/dates';

interface LeaveRequest {
  id: string;
  user_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  days: number;
  status: string;
  created_at: string;
  leave_types: { code: string; name: string } | null;
}

interface HistoryClientProps {
  profile: { id: string; full_name: string; email: string; role: string } | null;
  initialRequests: LeaveRequest[];
}

const STATUS_FILTER_OPTIONS = ['all', 'pending', 'approved', 'rejected', 'cancelled'] as const;

export default function HistoryClient({ profile, initialRequests }: HistoryClientProps) {
  const [requests, setRequests] = useState(initialRequests);
  const [filter, setFilter] = useState<string>('all');
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);

  const filteredRequests = filter === 'all' ? requests : requests.filter((r) => r.status === filter);

  async function handleCancel(requestId: string) {
    setCancelling(requestId);
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.rpc('cancel_leave_request', {
        p_request_id: requestId,
      });

      if (error) {
        const msg = error.message.replace(/^[A-Z_]+: /, '');
        alert(msg);
        clientLogger.warn('Cancel failed', { action: 'cancel_leave', code: error.code });
        return;
      }

      setRequests((prev) =>
        prev.map((r) => r.id === requestId ? { ...r, status: 'cancelled' } : r)
      );
      clientLogger.info('Leave request cancelled', { action: 'cancel_leave', requestId });
    } catch (err) {
      alert('Failed to cancel. Please try again.');
      clientLogger.error('Cancel error', err instanceof Error ? err : undefined);
    } finally {
      setCancelling(null);
      setConfirmCancelId(null);
    }
  }

  const canCancel = (req: LeaveRequest): boolean => {
    if (req.status === 'cancelled' || req.status === 'rejected') return false;
    if (req.status === 'approved') {
      return req.start_date > new Date().toISOString().split('T')[0];
    }
    return true; // pending
  };

  return (
    <AppShell profile={profile} activeRoute="/history">
      <div className="page-container">
        <div className="pt-4 mb-5 flex items-center justify-between">
          <h1 className="text-xl font-bold text-white">Leave History</h1>
        </div>

        {/* Filter Pills */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
          {STATUS_FILTER_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              id={`filter-${s}`}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-medium transition-all min-h-0 ${
                filter === s
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
              }`}
            >
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {/* Request List */}
        {filteredRequests.length === 0 ? (
          <div className="text-center py-16 text-slate-500 animate-fade-in">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-sm">No {filter !== 'all' ? filter : ''} leave requests found</p>
          </div>
        ) : (
          <div className="space-y-3 animate-slide-up">
            {filteredRequests.map((req) => (
              <div key={req.id} className="card p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <div className="font-medium text-slate-200 text-sm">
                      {req.leave_types?.name ?? 'Unknown Type'}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {displayDateRange(req.start_date, req.end_date)} · {req.days} day{req.days !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <span className={`badge-${req.status} flex-shrink-0`}>
                    {req.status}
                  </span>
                </div>

                <div className="text-xs text-slate-500 mb-3">
                  Applied {displayDate(req.created_at.split('T')[0])}
                </div>

                {canCancel(req) && (
                  <>
                    {confirmCancelId === req.id ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => void handleCancel(req.id)}
                          disabled={cancelling === req.id}
                          className="btn-danger flex-1 py-2 text-xs min-h-0"
                          id={`confirm-cancel-${req.id}`}
                        >
                          {cancelling === req.id ? 'Cancelling…' : 'Yes, Cancel'}
                        </button>
                        <button
                          onClick={() => setConfirmCancelId(null)}
                          className="btn-secondary flex-1 py-2 text-xs min-h-0"
                        >
                          Keep
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmCancelId(req.id)}
                        className="text-xs text-red-400 hover:text-red-300 transition-colors"
                        id={`cancel-btn-${req.id}`}
                      >
                        Cancel request
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
