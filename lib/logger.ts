/**
 * LeaveEase — Structured Logger (server-side, pino-based)
 *
 * REDACTION IS MANDATORY — see lib/redact.ts
 * Never log: leave reason, rejection_reason, passwords, tokens, API keys,
 * auth headers, emails (use userId instead), full request bodies.
 *
 * Log shape:
 *   { ts, level, service, env, requestId, userId, route, action,
 *     durationMs, msg, err: { name, message, stack } }
 */

import pino from 'pino';
import { redact } from './redact';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type Service = 'web' | 'edge' | 'db' | 'client';

export interface LogContext {
  requestId?: string;
  userId?: string;
  route?: string;
  action?: string;
  durationMs?: number;
  service?: Service;
  [key: string]: unknown;
}

const LOG_LEVEL = (process.env.LOG_LEVEL as LogLevel) || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

const baseLogger = pino({
  level: LOG_LEVEL,
  base: {
    service: 'web',
    env: process.env.NODE_ENV,
  },
  timestamp: () => `,"ts":"${new Date().toISOString()}"`,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  // pino redact — belt-and-suspenders on top of our explicit redactor
  redact: {
    paths: [
      'password',
      'token',
      'apiKey',
      'api_key',
      'authorization',
      'x-api-key',
      '*.password',
      '*.token',
      '*.reason',
      '*.rejection_reason',
      '*.email',
    ],
    censor: '[REDACTED]',
  },
});

export function createLogger(ctx: LogContext = {}) {
  const child = baseLogger.child(ctx);

  return {
    debug: (msg: string, extra?: Record<string, unknown>) =>
      child.debug(redactContext(extra), msg),
    info: (msg: string, extra?: Record<string, unknown>) =>
      child.info(redactContext(extra), msg),
    warn: (msg: string, extra?: Record<string, unknown>) =>
      child.warn(redactContext(extra), msg),
    error: (msg: string, err?: unknown, extra?: Record<string, unknown>) =>
      child.error({ ...redactContext(extra), err: formatErr(err) }, msg),
    child: (childCtx: LogContext) => createLogger({ ...ctx, ...childCtx }),
    withRequestId: (requestId: string) => createLogger({ ...ctx, requestId }),
    withUserId: (userId: string) => createLogger({ ...ctx, userId }),
  };
}

function redactContext(ctx?: Record<string, unknown>): Record<string, unknown> {
  if (!ctx) return {};
  return redact(ctx);
}

function formatErr(err: unknown): Record<string, string> | undefined {
  if (!err) return undefined;
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack ?? '',
    };
  }
  return { name: 'UnknownError', message: String(err), stack: '' };
}

/** Root app logger — extend with createLogger({ requestId, userId, ... }) */
export const logger = createLogger({ service: 'web' });
