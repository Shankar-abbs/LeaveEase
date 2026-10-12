/**
 * LeaveEase — Zod Schemas (shared client/server)
 * All form and API validation uses these schemas.
 */
import { z } from 'zod';

// ─── Leave Types ────────────────────────────────────────────────────────────
export const LeaveTypeCode = z.enum(['CL', 'SL', 'EL']);
export type LeaveTypeCode = z.infer<typeof LeaveTypeCode>;

// ─── Roles ───────────────────────────────────────────────────────────────────
export const UserRole = z.enum(['employee', 'manager', 'hr_admin']);
export type UserRole = z.infer<typeof UserRole>;

// ─── Leave Request Status ────────────────────────────────────────────────────
export const LeaveStatus = z.enum(['pending', 'approved', 'rejected', 'cancelled']);
export type LeaveStatus = z.infer<typeof LeaveStatus>;

// ─── Submit Leave Request ────────────────────────────────────────────────────
export const SubmitLeaveRequestSchema = z.object({
  leave_type_code: LeaveTypeCode,
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format'),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format'),
  start_half: z.boolean().default(false),
  end_half: z.boolean().default(false),
  reason: z.string().min(10, 'Reason must be at least 10 characters').max(1000, 'Reason too long'),
  idempotency_key: z.string().uuid('Must be a valid UUID'),
}).refine((data) => data.end_date >= data.start_date, {
  message: 'End date must be on or after start date',
  path: ['end_date'],
});

export type SubmitLeaveRequestInput = z.infer<typeof SubmitLeaveRequestSchema>;

// ─── Decide Leave Request ────────────────────────────────────────────────────
export const DecideLeaveRequestSchema = z.object({
  request_id: z.string().uuid(),
  decision: z.enum(['approved', 'rejected']),
  rejection_reason: z.string().min(5, 'Rejection reason must be at least 5 characters').max(500).optional(),
}).refine(
  (data) => data.decision !== 'rejected' || (data.rejection_reason && data.rejection_reason.length >= 5),
  {
    message: 'Rejection reason is required when rejecting',
    path: ['rejection_reason'],
  }
);

export type DecideLeaveRequestInput = z.infer<typeof DecideLeaveRequestSchema>;

// ─── Cancel Leave Request ─────────────────────────────────────────────────────
export const CancelLeaveRequestSchema = z.object({
  request_id: z.string().uuid(),
});

// ─── HR Policy Settings ──────────────────────────────────────────────────────
export const PolicySettingsSchema = z.object({
  auto_approve_below_days: z.number().int().min(0).max(30),
  weekly_off_days: z.array(z.number().int().min(0).max(6)).min(0).max(7),
  timezone: z.string().default('Asia/Kolkata'),
});

export type PolicySettings = z.infer<typeof PolicySettingsSchema>;

// ─── Invite User ─────────────────────────────────────────────────────────────
export const InviteUserSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(2).max(100),
  branch_id: z.string().uuid(),
  manager_email: z.string().email().optional(),
  role: UserRole,
  joined_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(() => new Date().toISOString().split('T')[0]),
});

export type InviteUserInput = z.infer<typeof InviteUserSchema>;

// ─── Onboard Employee ─────────────────────────────────────────────────────────
export const OnboardEmployeeSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters'),
  email: z.string().trim().email('Valid work email address is required (e.g. employee@kestrel.com)'),
  role: z.enum(['employee', 'manager', 'hr_admin'], {
    errorMap: () => ({ message: 'Please select a valid role (Employee, Manager, or HR Admin)' }),
  }),
  branchId: z.string().uuid('Please select a valid company branch'),
  managerId: z.string().uuid('Please select a valid manager').nullable().optional(),
  tempPassword: z.string().min(8, 'Temporary password must be at least 8 characters'),
  grantQuotas: z.boolean().default(true),
});

export type OnboardEmployeeInput = z.infer<typeof OnboardEmployeeSchema>;

// ─── HR Monthly Report ────────────────────────────────────────────────────────
export const MonthlyReportSchema = z.object({
  year: z.number().int().min(2020).max(2099),
  month: z.number().int().min(1).max(12),
});

// ─── Team Calendar Query ──────────────────────────────────────────────────────
export const TeamCalendarQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// ─── Client Log Event ────────────────────────────────────────────────────────
export const ClientLogEventSchema = z.object({
  ts: z.string(),
  level: z.enum(['debug', 'info', 'warn', 'error']),
  service: z.literal('client'),
  requestId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  route: z.string().max(200).optional(),
  action: z.string().max(100).optional(),
  msg: z.string().max(2000),
  context: z.record(z.unknown()).optional(),
  err: z.object({
    name: z.string(),
    message: z.string().max(2000),
    stack: z.string().max(5000),
  }).optional(),
});
