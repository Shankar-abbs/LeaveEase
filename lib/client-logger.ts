/**
 * LeaveEase — Client-side browser logger
 *
 * Captures into a 200-entry ring buffer (Dexie) and ships to log_event()
 * when online. Global error boundary, window.onerror, unhandledrejection.
 *
 * PII rules: same as server — never log reason, email, tokens.
 */

import { redact, redactString } from './redact';

export type ClientLogLevel = 'debug' | 'info' | 'warn' | 'error';

interface ClientLogEntry {
  ts: string;
  level: ClientLogLevel;
  service: 'client';
  requestId?: string;
  userId?: string;
  route?: string;
  action?: string;
  msg: string;
  context?: Record<string, unknown>;
  err?: { name: string; message: string; stack: string };
}

const RING_BUFFER_SIZE = 200;
let ringBuffer: ClientLogEntry[] = [];
let currentUserId: string | undefined;
let currentRequestId: string | undefined;

export function initClientLogger(opts: { userId?: string; requestId?: string }) {
  currentUserId = opts.userId;
  currentRequestId = opts.requestId;
}

export function clearClientLogger() {
  ringBuffer = [];
  currentUserId = undefined;
  currentRequestId = undefined;
}

function push(entry: ClientLogEntry) {
  if (ringBuffer.length >= RING_BUFFER_SIZE) {
    ringBuffer.shift();
  }
  ringBuffer.push(entry);
  // Best-effort ship warn/error to server when online
  if ((entry.level === 'warn' || entry.level === 'error') && navigator?.onLine) {
    void shipToServer(entry);
  }
}

async function shipToServer(entry: ClientLogEntry) {
  try {
    await fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
      keepalive: true,
    });
  } catch {
    // silently swallow — logging must never break the user flow
  }
}

function makeEntry(
  level: ClientLogLevel,
  msg: string,
  context?: Record<string, unknown>,
  err?: unknown
): ClientLogEntry {
  return {
    ts: new Date().toISOString(),
    level,
    service: 'client',
    requestId: currentRequestId,
    userId: currentUserId,
    route: typeof window !== 'undefined' ? window.location.pathname : undefined,
    msg: redactString(msg),
    context: context ? (redact(context) as Record<string, unknown>) : undefined,
    err: err instanceof Error
      ? { name: err.name, message: redactString(err.message), stack: err.stack ?? '' }
      : undefined,
  };
}

export const clientLogger = {
  debug: (msg: string, ctx?: Record<string, unknown>) => push(makeEntry('debug', msg, ctx)),
  info: (msg: string, ctx?: Record<string, unknown>) => push(makeEntry('info', msg, ctx)),
  warn: (msg: string, ctx?: Record<string, unknown>) => push(makeEntry('warn', msg, ctx)),
  error: (msg: string, err?: unknown, ctx?: Record<string, unknown>) => push(makeEntry('error', msg, ctx, err)),

  /** Returns redacted ring buffer as JSON string — safe to copy and share */
  debugDump(): string {
    return JSON.stringify(ringBuffer, null, 2);
  },

  getBuffer(): ClientLogEntry[] {
    return [...ringBuffer];
  },
};

/** Install global error handlers — call once in root layout */
export function installGlobalErrorHandlers() {
  if (typeof window === 'undefined') return;

  window.onerror = (message, source, lineno, colno, error) => {
    clientLogger.error(
      `Unhandled error: ${redactString(String(message))}`,
      error,
      { source, lineno, colno }
    );
  };

  window.onunhandledrejection = (event) => {
    clientLogger.error(
      'Unhandled promise rejection',
      event.reason instanceof Error ? event.reason : new Error(String(event.reason))
    );
  };
}
