'use client';

import { useState, useCallback, useId } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { getSupabaseClient } from '@/lib/supabase/client';
import { countLeaveDays, displayDate } from '@/lib/dates';
import { clientLogger } from '@/lib/client-logger';
import AppShell from '@/components/AppShell';

const uuidv4 = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : '00000000-0000-4000-8000-000000000000');

const leaveFormSchema = z.object({
  leave_type_code: z.enum(['CL', 'SL', 'EL']),
  start_date: z.string().min(1, 'Start date is required'),
  end_date: z.string().min(1, 'End date is required'),
  start_half: z.boolean().default(false),
  end_half: z.boolean().default(false),
  reason: z.string().min(10, 'Reason must be at least 10 characters').max(1000),
}).refine((d) => d.end_date >= d.start_date, {
  message: 'End date must be on or after start date',
  path: ['end_date'],
});

type LeaveFormData = z.infer<typeof leaveFormSchema>;

interface Balance {
  leave_type_id: string;
  leave_type_code: string;
  leave_type_name: string;
  balance: number;
  pending: number;
  available: number;
}

interface LeaveType {
  id: string;
  code: string;
  name: string;
}

interface ApplyPageClientProps {
  profile: { id: string; full_name: string; email: string; role: string } | null;
  leaveTypes: LeaveType[];
  balances: Balance[];
  weeklyOffDays: number[];
}

export default function ApplyPageClient({ profile, leaveTypes, balances, weeklyOffDays }: ApplyPageClientProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');
  const [success, setSuccess] = useState(false);
  const formId = useId();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<LeaveFormData>({
    resolver: zodResolver(leaveFormSchema),
    defaultValues: {
      leave_type_code: 'CL',
      start_half: false,
      end_half: false,
    },
  });

  const watchedValues = watch();
  const today = new Date().toISOString().split('T')[0];

  // Client-side day preview
  const previewDays = useCallback(() => {
    if (!watchedValues.start_date || !watchedValues.end_date) return null;
    if (watchedValues.end_date < watchedValues.start_date) return null;
    try {
      return countLeaveDays(
        watchedValues.start_date,
        watchedValues.end_date,
        watchedValues.start_half,
        watchedValues.end_half,
        weeklyOffDays,
      );
    } catch {
      return null;
    }
  }, [watchedValues, weeklyOffDays]);

  const selectedBalance = balances.find((b) => b.leave_type_code === watchedValues.leave_type_code);
  const days = previewDays();
  const insufficientBalance = days != null && selectedBalance != null && days > selectedBalance.available;

  async function onSubmit(data: LeaveFormData) {
    setSubmitting(true);
    setServerError('');

    const idempotencyKey = uuidv4();
    const supabase = getSupabaseClient();

    try {
      const { data: result, error } = await supabase.rpc('submit_leave_request', {
        p_leave_type_code: data.leave_type_code,
        p_start_date: data.start_date,
        p_end_date: data.end_date,
        p_start_half: data.start_half,
        p_end_half: data.end_half,
        p_reason: data.reason,
        p_idempotency_key: idempotencyKey,
      });

      if (error) {
        const errorCode = error.message?.split(':')[0]?.trim();
        setServerError(error.message);
        clientLogger.warn('Leave request submission failed', { action: 'submit_leave', code: errorCode });
        return;
      }

      clientLogger.info('Leave request submitted', {
        action: 'submit_leave',
        requestId: result?.request_id,
        status: result?.status,
      });

      // Trigger background email dispatch via Resend
      fetch('/api/notifications/dispatch', { method: 'POST' }).catch(() => {});

      setSuccess(true);
      setTimeout(() => router.push('/history'), 1500);
    } catch (err) {
      // Offline: queue to outbox
      if (!navigator.onLine) {
        await queueOffline({ ...data, idempotency_key: idempotencyKey });
        setSuccess(true);
        setTimeout(() => router.push('/history'), 1500);
      } else {
        setServerError('An unexpected error occurred. Please try again.');
        clientLogger.error('Leave request error', err instanceof Error ? err : undefined);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function queueOffline(data: LeaveFormData & { idempotency_key: string }) {
    // Dexie outbox — imported dynamically to avoid SSR issues
    try {
      const { getOutbox } = await import('@/lib/offline/outbox');
      await getOutbox().add({
        id: data.idempotency_key,
        op: 'submit_leave_request',
        payload: data,
        status: 'queued',
        createdAt: new Date().toISOString(),
      });
      clientLogger.info('Leave request queued offline', { action: 'offline_queue' });
    } catch (e) {
      clientLogger.error('Failed to queue offline request', e instanceof Error ? e : undefined);
    }
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="text-center animate-slide-up">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">
            {navigator.onLine ? 'Request Submitted!' : 'Queued for Sync'}
          </h2>
          <p className="text-slate-400 text-sm">Redirecting to history…</p>
        </div>
      </div>
    );
  }

  return (
    <AppShell profile={profile} activeRoute="/apply">
      <div className="page-container">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6 pt-4">
          <button onClick={() => router.back()} className="btn-ghost p-2 min-h-0 rounded-xl">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-bold text-white">Apply for Leave</h1>
        </div>

        <form
          id={`${formId}-apply-form`}
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-5 animate-slide-up"
        >
          {/* Leave Type */}
          <div>
            <label className="label" htmlFor={`${formId}-leave-type`}>Leave Type</label>
            <select
              id={`${formId}-leave-type`}
              className="input"
              {...register('leave_type_code')}
            >
              {leaveTypes.map((lt) => {
                const bal = balances.find((b) => b.leave_type_code === lt.code);
                return (
                  <option key={lt.id} value={lt.code}>
                    {lt.name} ({lt.code}) — {bal?.available ?? 0} days available
                  </option>
                );
              })}
            </select>
            {errors.leave_type_code && (
              <p className="mt-1 text-xs text-red-400">{errors.leave_type_code.message}</p>
            )}
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor={`${formId}-start-date`}>Start Date</label>
              <input
                id={`${formId}-start-date`}
                type="date"
                min={today}
                className="input"
                {...register('start_date')}
              />
              {errors.start_date && (
                <p className="mt-1 text-xs text-red-400">{errors.start_date.message}</p>
              )}
            </div>
            <div>
              <label className="label" htmlFor={`${formId}-end-date`}>End Date</label>
              <input
                id={`${formId}-end-date`}
                type="date"
                min={watchedValues.start_date || today}
                className="input"
                {...register('end_date')}
              />
              {errors.end_date && (
                <p className="mt-1 text-xs text-red-400">{errors.end_date.message}</p>
              )}
            </div>
          </div>

          {/* Half Day Toggles */}
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                id={`${formId}-start-half`}
                className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-brand-500"
                {...register('start_half')}
              />
              <span className="text-sm text-slate-300">Half day (start)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                id={`${formId}-end-half`}
                className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-brand-500"
                {...register('end_half')}
              />
              <span className="text-sm text-slate-300">Half day (end)</span>
            </label>
          </div>

          {/* Day Preview */}
          {days != null && (
            <div className={`rounded-xl p-4 flex items-center gap-3 border ${insufficientBalance ? 'bg-red-500/10 border-red-500/30' : 'bg-brand-500/10 border-brand-500/30'}`}>
              <div className={`text-2xl font-bold ${insufficientBalance ? 'text-red-400' : 'text-brand-400'}`}>
                {days}
              </div>
              <div>
                <div className={`text-sm font-medium ${insufficientBalance ? 'text-red-300' : 'text-brand-300'}`}>
                  {days === 1 ? 'Working day' : 'Working days'}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {insufficientBalance
                    ? `⚠️ Insufficient balance (${selectedBalance?.available ?? 0} available)`
                    : `Server is the authority — preview only`}
                </div>
              </div>
            </div>
          )}

          {/* Reason */}
          <div>
            <label className="label" htmlFor={`${formId}-reason`}>
              Reason <span className="text-slate-500 font-normal text-xs">(private — only you and your manager see this)</span>
            </label>
            <textarea
              id={`${formId}-reason`}
              rows={4}
              className="input resize-none"
              placeholder="Please provide a reason for your leave request (minimum 10 characters)..."
              {...register('reason')}
            />
            {errors.reason && (
              <p className="mt-1 text-xs text-red-400">{errors.reason.message}</p>
            )}
          </div>

          {/* Server Error */}
          {serverError && (
            <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {serverError.replace(/^[A-Z_]+: /, '')}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            id="submit-leave-btn"
            className="btn-primary w-full py-4 text-base rounded-2xl"
            disabled={submitting || insufficientBalance}
          >
            {submitting ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                Submitting…
              </>
            ) : navigator.onLine === false ? (
              '📡 Queue for Sync'
            ) : (
              'Submit Request'
            )}
          </button>
        </form>
      </div>
    </AppShell>
  );
}
