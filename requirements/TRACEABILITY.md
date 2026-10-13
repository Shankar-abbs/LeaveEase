# Traceability Matrix

This document maps requirements to database migrations, application code, security policies, and test suites.

| Requirement | Migration / Database Objects | Code / Screen | Test Coverage | Status |
| :--- | :--- | :--- | :--- | :--- |
| **REQ-001** (Leave Types & Quotas) | `20261012000001_core_tables.sql` (`leave_types`) | `lib/dates.ts`, `lib/schemas.ts` | `tests/unit/dates.test.ts` | Complete |
| **REQ-002** (Leave Submission) | `20261012000002_leave_requests.sql`, `20261012000004_rpcs.sql` (`submit_leave_request`) | `app/apply/`, `lib/schemas.ts` | `tests/unit/schemas.test.ts`, `tests/e2e/workflow.spec.ts` | Complete |
| **REQ-003** (Manager Approvals) | `20261012000004_rpcs.sql` (`decide_leave_request`) | `app/approvals/`, `components/AppShell.tsx` | `tests/e2e/workflow.spec.ts`, `tests/privacy/privacy-guard.test.ts` | Complete |
| **REQ-004** (Auto Approval) | `20261012000001_core_tables.sql` (`policy_settings`), `20261012000004_rpcs.sql` | `app/admin/`, `app/apply/` | `tests/e2e/workflow.spec.ts` | Complete |
| **REQ-005** (Privacy Invariants) | RLS policies on `leave_requests`, `leave_ledger` | `lib/redact.ts`, `lib/logger.ts` | `tests/privacy/privacy-guard.test.ts`, `tests/unit/redact.test.ts` | Complete |
| **REQ-006** (Team Calendar) | `20261012000004_rpcs.sql`, `20261012000008_fix_team_calendar_visibility.sql` (`team_calendar`) | `app/team-calendar/` | `tests/privacy/privacy-guard.test.ts` | Complete |
| **REQ-007** (Balance Ledger & Cancel) | `20261012000002_leave_requests.sql` (`leave_ledger`), `20261012000004_rpcs.sql` | `app/history/`, `app/dashboard/` | `tests/privacy/privacy-guard.test.ts`, `tests/e2e/workflow.spec.ts` | Complete |
| **REQ-008** (EL Accrual & Reset) | `20261012000004_rpcs.sql` (`run_monthly_accrual`, `run_annual_reset`) | `lib/dates.ts` | `tests/unit/dates.test.ts` | Complete |
| **REQ-009** (Offline & Sync) | `lib/offline/outbox.ts`, `lib/offline/useSync.ts` | `components/AppShell.tsx`, `public/sw.js` | `tests/e2e/workflow.spec.ts` | Complete |
| **REQ-010** (Notifications) | `20261012000003_notifications_audit_logs.sql` (`notification_outbox`) | `supabase/functions/send-notification/` | Edge function tests | Complete |
| **REQ-011** (Observability & Logs) | `20261012000003_notifications_audit_logs.sql` (`app_logs`, `log_event`) | `lib/logger.ts`, `lib/redact.ts`, `app/api/log/` | `tests/unit/redact.test.ts`, `tests/privacy/privacy-guard.test.ts` | Complete |
| **REQ-012** (HR Monthly Report) | `20261012000004_rpcs.sql` (`hr_monthly_report`) | `app/admin/` | `tests/privacy/privacy-guard.test.ts` | Complete |
| **REQ-013** (User Administration) | `20261012000001_core_tables.sql` (`branches`, `profiles`) | `app/admin/`, `scripts/create-demo-users.ts` | `app/admin/admin-client.tsx` | Complete |
