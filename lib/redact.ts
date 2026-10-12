/**
 * LeaveEase — PII Redactor
 *
 * MANDATORY: called before ANY log output, API response, email template,
 * or CSV export. Unit-tested in tests/unit/redact.test.ts.
 *
 * Never let these through: leave reason, rejection_reason, passwords,
 * tokens, API keys, auth headers, email addresses, full request bodies.
 */

/** Top-level keys that must never appear in any log output */
const BLOCKED_KEYS = new Set([
  'reason',
  'rejection_reason',
  'password',
  'token',
  'api_key',
  'apiKey',
  'access_token',
  'accessToken',
  'refresh_token',
  'refreshToken',
  'service_role_key',
  'serviceRoleKey',
  'authorization',
  'x-api-key',
  'resend_api_key',
  'resendApiKey',
  'secret',
  'private_key',
  'privateKey',
]);

/** Regex patterns that should be caught even when nested or renamed */
const SENSITIVE_PATTERNS = [
  /password/i,
  /token/i,
  /secret/i,
  /api[_-]?key/i,
  /reason/i,        // covers reason + rejection_reason
  /private[_-]?key/i,
  /authorization/i,
];

export function redact<T>(obj: T, depth = 0): T {
  if (depth > 10) return '[MAX_DEPTH]' as unknown as T;
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return (obj as unknown[]).map((item) => redact(item, depth + 1)) as unknown as T;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (isBlockedKey(key)) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      result[key] = redact(value, depth + 1);
    } else {
      result[key] = value;
    }
  }
  return result as T;
}

function isBlockedKey(key: string): boolean {
  const lower = key.toLowerCase();
  if (BLOCKED_KEYS.has(lower)) return true;
  return SENSITIVE_PATTERNS.some((re) => re.test(lower));
}

/**
 * Redact a string value — used for log messages that might accidentally
 * contain raw sensitive strings (e.g., an error message quoting a URL with a token).
 */
export function redactString(s: string): string {
  // Remove Bearer tokens
  s = s.replace(/Bearer\s+[\w\-._~+/]+=*/gi, 'Bearer [REDACTED]');
  // Remove JWT-like values
  s = s.replace(/eyJ[\w\-._~+/]+=*\.eyJ[\w\-._~+/]+=*\.[\w\-._~+/]+=*/g, '[JWT_REDACTED]');
  // Remove email addresses (log userId instead)
  s = s.replace(/\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g, '[EMAIL_REDACTED]');
  return s;
}

/**
 * Check that a log payload does NOT contain any reason text.
 * Used in privacy-guard tests.
 */
export function containsReason(payload: unknown): boolean {
  const str = JSON.stringify(payload);
  // If any key called "reason" has a non-empty string value other than [REDACTED], fail
  const reasonPattern = /"(?:reason|rejection_reason)"\s*:\s*"([^"]+)"/g;
  let match;
  while ((match = reasonPattern.exec(str)) !== null) {
    if (match[1] !== '[REDACTED]' && match[1].trim().length > 0) {
      return true;
    }
  }
  return false;
}
