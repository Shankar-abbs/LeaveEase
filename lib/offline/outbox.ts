/**
 * LeaveEase — Dexie (IndexedDB) offline database
 * Stores cached data and the outbox for offline operations.
 * NEVER stores another user's data. Cleared on logout.
 */
import Dexie, { type Table } from 'dexie';

export interface OutboxEntry {
  id: string;           // idempotency UUID
  op: string;           // RPC operation name
  payload: Record<string, unknown>;
  status: 'queued' | 'syncing' | 'failed' | 'done';
  error?: string;
  createdAt: string;    // ISO timestamp
  attempts?: number;
}

export interface CachedBalance {
  leave_type_code: string;
  leave_type_name: string;
  balance: number;
  pending: number;
  available: number;
  cachedAt: string;
}

export interface CachedRequest {
  id: string;
  leave_type_code: string;
  start_date: string;
  end_date: string;
  days: number;
  status: string;
  created_at: string;
}

export interface CachedCalendarEntry {
  id: string;
  user_id: string;
  display_name: string;
  start_date: string;
  end_date: string;
}

class LeaveEaseDB extends Dexie {
  outbox!: Table<OutboxEntry, string>;
  balances!: Table<CachedBalance, string>;
  requests!: Table<CachedRequest, string>;
  calendar!: Table<CachedCalendarEntry, string>;

  constructor() {
    super('leaveease-v1');

    this.version(1).stores({
      outbox:   'id, op, status, createdAt',
      balances: 'leave_type_code, cachedAt',
      requests: 'id, status, start_date, created_at',
      calendar: 'id, user_id, start_date',
    });
  }
}

let _db: LeaveEaseDB | null = null;

export function getDB(): LeaveEaseDB {
  if (typeof window === 'undefined') {
    throw new Error('IndexedDB is not available server-side');
  }
  if (!_db) {
    _db = new LeaveEaseDB();
  }
  return _db;
}

export function getOutbox() {
  return getDB().outbox;
}

/** Clear all local data — MUST be called on logout */
export async function clearAllLocalData(): Promise<void> {
  const db = getDB();
  await Promise.all([
    db.outbox.clear(),
    db.balances.clear(),
    db.requests.clear(),
    db.calendar.clear(),
  ]);
}
