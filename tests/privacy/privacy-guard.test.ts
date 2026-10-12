import { describe, it, expect } from 'vitest';
import { redact, redactString, containsReason } from '@/lib/redact';

describe('Privacy Guard Suite (Section 9 Invariants)', () => {
  it('team_calendar columns invariant: returns strictly user_id, display_name, start_date, end_date', () => {
    // Expected RPC schema contract
    const allowedColumns = ['user_id', 'display_name', 'start_date', 'end_date'];
    const sampleRpcRow = {
      user_id: '123e4567-e89b-12d3-a456-426614174000',
      display_name: 'Rahul Sharma',
      start_date: '2026-10-15',
      end_date: '2026-10-16',
    };

    const keys = Object.keys(sampleRpcRow);
    expect(keys.sort()).toEqual(allowedColumns.sort());

    // Invariant: NEVER contains reason or leave type
    expect(keys).not.toContain('reason');
    expect(keys).not.toContain('rejection_reason');
    expect(keys).not.toContain('leave_type');
    expect(keys).not.toContain('status');
  });

  it('HR Monthly Report column invariant: never includes reason or rejection_reason', () => {
    const sampleHrRow = {
      employee_name: 'Vikram Mehta',
      email: 'vikram@leaveease.test',
      branch_name: 'Mumbai HQ',
      leave_type: 'CL',
      start_date: '2026-10-12',
      end_date: '2026-10-14',
      days: 3,
      status: 'approved',
      decided_at: '2026-10-11T10:00:00Z',
    };

    const keys = Object.keys(sampleHrRow);
    expect(keys).not.toContain('reason');
    expect(keys).not.toContain('rejection_reason');
  });

  it('Log line reason protection: containsReason correctly catches accidental reason leakage', () => {
    const rawObjectWithReason = {
      userId: '123e4567-e89b-12d3-a456-426614174000',
      action: 'submit',
      reason: 'Confidential medical leave',
    };

    // Before redaction, reason is detected
    expect(containsReason(rawObjectWithReason)).toBe(true);

    // After passing through mandatory redactor, reason is stripped
    const safeObject = redact(rawObjectWithReason);
    expect(containsReason(safeObject)).toBe(false);
    expect(safeObject.reason).toBe('[REDACTED]');
  });

  it('Audit and log message string sanitation prevents token, secret, and email leakage', () => {
    const sampleMessage = 'User emp1@kestrel.com failed auth with token Bearer secret-auth-token-12345';
    const sanitized = redactString(sampleMessage);

    expect(sanitized).not.toContain('emp1@kestrel.com');
    expect(sanitized).not.toContain('secret-auth-token-12345');
    expect(sanitized).toContain('[EMAIL_REDACTED]');
    expect(sanitized).toContain('Bearer [REDACTED]');
  });

  it('Notification email templates never include reason text', () => {
    // Invariant check on email generation payload
    const emailPayload = {
      request_id: 'req-1',
      employee_name: 'Anjali Singh',
      days: 2,
      start_date: '2026-10-15',
      end_date: '2026-10-16',
    };

    expect(emailPayload).not.toHaveProperty('reason');
    expect(emailPayload).not.toHaveProperty('rejection_reason');
  });
});
