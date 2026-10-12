'use client';

import { useEffect, useRef } from 'react';
import { getDB, getOutbox, type OutboxEntry } from './outbox';
import { getSupabaseClient } from '@/lib/supabase/client';
import { clientLogger } from '@/lib/client-logger';

const SYNC_TAG = 'leaveease-sync';
const MAX_ATTEMPTS = 5;
const BACKOFF_BASE_MS = 1000;

/**
 * useSync — flushes the offline outbox when:
 * 1. Online event fires
 * 2. App gains focus
 * 3. Background Sync (where supported)
 *
 * Operations are processed in FIFO order.
 * Failed ops are marked with error and retried with exponential backoff.
 * Server is the authority — on conflict, marks entry as "failed" with server reason.
 */
export function useSync() {
  const syncing = useRef(false);

  async function flush() {
    if (syncing.current) return;
    if (!navigator.onLine) return;

    const outbox = getOutbox();
    const queued = await outbox
      .where('status').anyOf(['queued', 'failed'])
      .sortBy('createdAt');

    const eligible = queued.filter((e) => (e.attempts ?? 0) < MAX_ATTEMPTS);
    if (eligible.length === 0) return;

    syncing.current = true;
    clientLogger.info('Sync flush started', { action: 'sync_start', count: eligible.length });

    const supabase = getSupabaseClient();

    for (const entry of eligible) {
      await outbox.update(entry.id, { status: 'syncing', attempts: (entry.attempts ?? 0) + 1 });

      try {
        const result = await executeOp(supabase, entry);
        await outbox.update(entry.id, { status: 'done', error: undefined });
        clientLogger.info('Sync entry succeeded', { action: 'sync_success', op: entry.op, entryId: entry.id });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const newAttempts = (entry.attempts ?? 0) + 1;

        if (newAttempts >= MAX_ATTEMPTS) {
          await outbox.update(entry.id, {
            status: 'failed',
            error: `[NEEDS ATTENTION] ${errMsg}`,
          });
          clientLogger.warn('Sync entry exhausted retries', {
            action: 'sync_exhausted',
            op: entry.op,
            entryId: entry.id,
            attempts: newAttempts,
          });
        } else {
          await outbox.update(entry.id, {
            status: 'failed',
            error: errMsg,
          });
          clientLogger.warn('Sync entry failed, will retry', {
            action: 'sync_retry',
            op: entry.op,
            attempts: newAttempts,
          });
        }
      }

      // Exponential backoff between entries
      const delay = Math.min(BACKOFF_BASE_MS * Math.pow(2, entry.attempts ?? 0), 30000);
      await sleep(delay);
    }

    syncing.current = false;
    clientLogger.info('Sync flush completed', { action: 'sync_end' });
  }

  useEffect(() => {
    // Register background sync
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      navigator.serviceWorker.ready.then((reg) => {
        (reg as any).sync?.register(SYNC_TAG).catch(() => {
          // Background sync not supported — fall back to event listeners
        });
      });
    }

    const handleOnline = () => {
      clientLogger.info('Online event — flushing outbox', { action: 'online_flush' });
      void flush();
    };
    const handleFocus = () => void flush();

    window.addEventListener('online', handleOnline);
    window.addEventListener('focus', handleFocus);

    // Flush on mount if online
    if (navigator.onLine) void flush();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  return { flush };
}

async function executeOp(supabase: ReturnType<typeof getSupabaseClient>, entry: OutboxEntry) {
  switch (entry.op) {
    case 'submit_leave_request': {
      const p = entry.payload as any;
      const { data, error } = await supabase.rpc('submit_leave_request', {
        p_leave_type_code: p.leave_type_code,
        p_start_date: p.start_date,
        p_end_date: p.end_date,
        p_start_half: p.start_half ?? false,
        p_end_half: p.end_half ?? false,
        p_reason: p.reason,
        p_idempotency_key: entry.id, // idempotency key IS the entry.id
      });
      if (error) throw new Error(error.message);
      return data;
    }

    case 'cancel_leave_request': {
      const p = entry.payload as any;
      const { error } = await supabase.rpc('cancel_leave_request', {
        p_request_id: p.request_id,
      });
      if (error) throw new Error(error.message);
      return null;
    }

    case 'decide_leave_request': {
      const p = entry.payload as any;
      const { error } = await supabase.rpc('decide_leave_request', {
        p_request_id: p.request_id,
        p_decision: p.decision,
        p_rejection_reason: p.rejection_reason,
      });
      if (error) throw new Error(error.message);
      return null;
    }

    default:
      throw new Error(`Unknown offline op: ${entry.op}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
