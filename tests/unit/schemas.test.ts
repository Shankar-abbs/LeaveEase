import { describe, it, expect } from 'vitest';
import {
  SubmitLeaveRequestSchema,
  DecideLeaveRequestSchema,
  PolicySettingsSchema,
} from '@/lib/schemas';

describe('Zod Validation Schemas', () => {
  it('validates a valid leave request submission', () => {
    const valid = {
      leave_type_code: 'CL',
      start_date: '2026-10-15',
      end_date: '2026-10-16',
      start_half: false,
      end_half: false,
      reason: 'Personal work and family appointment',
      idempotency_key: '123e4567-e89b-12d3-a456-426614174000',
    };

    const res = SubmitLeaveRequestSchema.safeParse(valid);
    expect(res.success).toBe(true);
  });

  it('rejects leave requests where end date is before start date', () => {
    const invalid = {
      leave_type_code: 'CL',
      start_date: '2026-10-20',
      end_date: '2026-10-15',
      reason: 'Valid long enough reason text',
      idempotency_key: '123e4567-e89b-12d3-a456-426614174000',
    };

    const res = SubmitLeaveRequestSchema.safeParse(invalid);
    expect(res.success).toBe(false);
  });

  it('enforces rejection reason of at least 5 characters when rejecting', () => {
    const missingReason = {
      request_id: '123e4567-e89b-12d3-a456-426614174000',
      decision: 'rejected',
      rejection_reason: 'no', // too short
    };

    const res = DecideLeaveRequestSchema.safeParse(missingReason);
    expect(res.success).toBe(false);

    const validRejection = {
      request_id: '123e4567-e89b-12d3-a456-426614174000',
      decision: 'rejected',
      rejection_reason: 'Too many concurrent warehouse absences scheduled',
    };

    const res2 = DecideLeaveRequestSchema.safeParse(validRejection);
    expect(res2.success).toBe(true);
  });

  it('validates policy settings correctly', () => {
    const valid = {
      auto_approve_below_days: 2,
      weekly_off_days: [0, 6],
      timezone: 'Asia/Kolkata',
    };

    expect(PolicySettingsSchema.safeParse(valid).success).toBe(true);
  });
});
