import { describe, it, expect } from 'vitest';
import { redact, redactString, containsReason } from '@/lib/redact';

describe('Central PII & Reason Redactor', () => {
  it('redacts leave reason and rejection_reason from objects', () => {
    const input = {
      requestId: '123e4567-e89b-12d3-a456-426614174000',
      reason: 'Undergoing confidential minor surgery',
      rejection_reason: 'Branch short-staffed during peak holiday period',
      status: 'pending',
    };

    const output = redact(input);
    expect(output.reason).toBe('[REDACTED]');
    expect(output.rejection_reason).toBe('[REDACTED]');
    expect(output.status).toBe('pending');
  });

  it('redacts sensitive auth keys and passwords', () => {
    const input = {
      user: 'john',
      password: 'superSecretPassword123!',
      apiKey: 'sk-ant-api03-xxxx',
      token: 'jwt.token.here',
    };

    const output = redact(input);
    expect(output.password).toBe('[REDACTED]');
    expect(output.apiKey).toBe('[REDACTED]');
    expect(output.token).toBe('[REDACTED]');
    expect(output.user).toBe('john');
  });

  it('handles nested objects and arrays cleanly', () => {
    const input = {
      metadata: {
        leaveDetails: {
          reason: 'Medical treatment',
          days: 3,
        },
      },
      audit: [{ action: 'submit', rejection_reason: 'Denied' }],
    };

    const output = redact(input);
    expect(output.metadata.leaveDetails.reason).toBe('[REDACTED]');
    expect(output.metadata.leaveDetails.days).toBe(3);
    expect(output.audit[0].rejection_reason).toBe('[REDACTED]');
  });

  it('redacts emails and bearer tokens in strings', () => {
    const logStr = 'Error sending to test.user@kestrel.com with Bearer eyJhbGciOiJIUzI1NiJ9.test';
    const cleanStr = redactString(logStr);
    expect(cleanStr).toContain('[EMAIL_REDACTED]');
    expect(cleanStr).toContain('Bearer [REDACTED]');
    expect(cleanStr).not.toContain('test.user@kestrel.com');
  });

  it('detects unredacted reasons via containsReason', () => {
    const cleanPayload = { action: 'leave_submit', days: 2 };
    const leakPayload = { action: 'leave_submit', reason: 'High fever and doctor advised rest' };

    expect(containsReason(cleanPayload)).toBe(false);
    expect(containsReason(leakPayload)).toBe(true);
  });
});
