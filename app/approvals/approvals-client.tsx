'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
  reason: string;
  status: string;
  created_at: string;
  profiles: { full_name: string; email: string; branches?: { name: string } | null } | null;
  leave_types: { code: string; name: string } | null;
}

interface ApprovalsClientProps {
  profile: { id: string; full_name: string; email: string; role: string } | null;
  initialRequests: LeaveRequest[];
}

export default function ApprovalsClient({ profile, initialRequests }: ApprovalsClientProps) {
  const [requests, setRequests] = useState(initialRequests);
  const [acting, setActing] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectionError, setRejectionError] = useState('');
  const supabase = getSupabaseClient();

  useEffect(() => {
    // Subscribe to realtime pending requests
    const channel = supabase
      .channel('pending-requests')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'leave_requests',
        filter: 'status=eq.pending',
      }, () => {
        void refreshRequests();
      })
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, []);

  async function refreshRequests() {
    const { data } = await supabase
      .from('leave_requests')
      .select(`*, profiles!leave_requests_user_id_fkey(full_name, email), leave_types(code, name)`)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(50);
    setRequests(data ?? []);
  }

  async function handleDecide(requestId: string, decision: 'approved' | 'rejected') {
    if (decision === 'rejected' && rejectionReason.trim().length < 5) {
      setRejectionError('Rejection reason must be at least 5 characters');
      return;
    }

    setActing(requestId);
    try {
      const { error } = await supabase.rpc('decide_leave_request', {
        p_request_id: requestId,
        p_decision: decision,
        p_rejection_reason: decision === 'rejected' ? rejectionReason.trim() : undefined,
      });

      if (error) {
        alert(error.message.replace(/^[A-Z_]+: /, ''));
        clientLogger.warn('Decision failed', { action: 'decide_leave', requestId, decision });
        return;
      }

      setRequests((prev) => prev.filter((r) => r.id !== requestId));
      setRejectingId(null);
      setRejectionReason('');
      clientLogger.info('Leave decision made', { action: 'decide_leave', requestId, decision });
    } catch (err) {
      alert('Failed to process decision. Please try again.');
      clientLogger.error('Decision error', err instanceof Error ? err : undefined);
    } finally {
      setActing(null);
    }
  }

  const pendingCount = requests.length;

  return (
    <AppShell profile={profile} activeRoute="/approvals">
      <div className="page-container">
        <div className="pt-4 mb-5">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white">Pending Approvals</h1>
            {pendingCount > 0 && (
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-500 text-amber-950 text-xs font-bold">
                {pendingCount}
              </span>
            )}
          </div>
        </div>

        {requests.length === 0 ? (
          <div className="text-center py-16 text-slate-500 animate-fade-in">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="font-medium text-slate-300">All caught up!</p>
            <p className="text-sm mt-1">No pending leave requests.</p>
          </div>
        ) : (
          <div className="space-y-4 animate-slide-up">
            {requests.map((req) => (
              <div key={req.id} className="card p-4" id={`approval-card-${req.id}`}>
                {/* Employee Info */}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-semibold text-slate-100">
                      {req.profiles?.full_name ?? 'Unknown'}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {req.profiles?.branches?.name ?? ''} · {req.leave_types?.name ?? ''} ({req.leave_types?.code})
                    </div>
                  </div>
                  <span className="badge-pending">pending</span>
                </div>

                {/* Dates */}
                <div className="bg-slate-700/50 rounded-xl p-3 mb-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-300">
                      {displayDateRange(req.start_date, req.end_date)}
                    </span>
                    <span className="font-bold text-white">
                      {req.days} day{req.days !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                {/* Reason — visible to manager/HR only (enforced server-side) */}
                {req.reason && (
                  <div className="text-sm text-slate-400 mb-3 italic">
                    &ldquo;{req.reason}&rdquo;
                  </div>
                )}

                {/* Rejection input */}
                {rejectingId === req.id && (
                  <div className="mb-3">
                    <label className="label text-xs" htmlFor={`rejection-reason-${req.id}`}>
                      Rejection Reason <span className="text-red-400">*</span>
                    </label>
                    <textarea
                      id={`rejection-reason-${req.id}`}
                      rows={3}
                      value={rejectionReason}
                      onChange={(e) => {
                        setRejectionReason(e.target.value);
                        setRejectionError('');
                      }}
                      className="input text-sm resize-none"
                      placeholder="Provide a reason for rejection (min 5 chars)..."
                    />
                    {rejectionError && (
                      <p className="text-xs text-red-400 mt-1">{rejectionError}</p>
                    )}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-2 mt-2">
                  {rejectingId !== req.id ? (
                    <>
                      <button
                        onClick={() => void handleDecide(req.id, 'approved')}
                        disabled={acting === req.id}
                        className="btn-primary flex-1 py-2.5 text-sm min-h-0"
                        id={`approve-btn-${req.id}`}
                      >
                        {acting === req.id ? '…' : '✓ Approve'}
                      </button>
                      <button
                        onClick={() => { setRejectingId(req.id); setRejectionReason(''); setRejectionError(''); }}
                        disabled={acting === req.id}
                        className="btn-danger flex-1 py-2.5 text-sm min-h-0"
                        id={`reject-start-btn-${req.id}`}
                      >
                        ✗ Reject
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => void handleDecide(req.id, 'rejected')}
                        disabled={acting === req.id}
                        className="btn-danger flex-1 py-2.5 text-sm min-h-0"
                        id={`reject-confirm-btn-${req.id}`}
                      >
                        {acting === req.id ? '…' : 'Confirm Reject'}
                      </button>
                      <button
                        onClick={() => { setRejectingId(null); setRejectionReason(''); }}
                        className="btn-secondary flex-1 py-2.5 text-sm min-h-0"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
