# LeaveEase Requirements Specification (v1.0)
**Client:** Kestrel Logistics Pvt Ltd  
**Target:** 220 employees across 14 branches  
**Specification Baseline:** Client Requirements v0.3 & Architectural Decisions D1–D13

---

## REQ-001: Leave Types and Quotas
- **Description:** System supports Casual Leave (CL, 12 days/yr), Sick Leave (SL, 10 days/yr), and Earned Leave (EL, 15 days/yr).
- **Given:** An active employee profile with a joining date.
- **When:** Initial allocation or annual reset occurs on 1 January.
- **Then:** CL and SL are granted in full (or prorated for new joiners), EL accrues monthly at 1.25 days/month; no carry-forward.
- **Status:** `implemented`
- **Tests:** `tests/unit/dates.test.ts`, `tests/privacy/privacy-guard.test.ts`

## REQ-002: Leave Request Submission
- **Description:** Employees submit leave requests specifying type, start/end dates, optional half-day toggles, and mandatory reason.
- **Given:** An authenticated employee with sufficient available balance and no overlapping requests.
- **When:** Submitting a leave request with a valid idempotency key.
- **Then:** Days are calculated in IST (excluding weekly-off days), request is created in `pending` state, and manager is notified.
- **Status:** `implemented`
- **Tests:** `tests/unit/schemas.test.ts`, `tests/unit/dates.test.ts`, `tests/e2e/workflow.spec.ts`

## REQ-003: Manager Approval & Rejection Workflow
- **Description:** Direct managers approve or reject pending leave requests of their reports.
- **Given:** A pending leave request submitted to a manager.
- **When:** Manager approves or rejects (rejection strictly requires >= 5 char reason).
- **Then:** Status transitions, ledger deducts balance on approval, notification outbox enqueues employee email, self-approval is blocked.
- **Status:** `implemented`
- **Tests:** `tests/privacy/privacy-guard.test.ts`, `tests/e2e/workflow.spec.ts`

## REQ-004: Automated Leave Approval
- **Description:** Requests below the HR-configured threshold are auto-approved per policy (D1).
- **Given:** `policy_settings.auto_approve_below_days` is configured > 0.
- **When:** An employee submits a Casual Leave (CL) request with duration strictly below the threshold.
- **Then:** Request status is set directly to `approved` with `decided_by='system'`, ledger is deducted immediately, and manager receives an informational email.
- **Status:** `implemented`
- **Tests:** `tests/e2e/workflow.spec.ts`

## REQ-005: Privacy & Separation of Concerns
- **Description:** Leave reasons contain sensitive medical or personal data and must NEVER be exposed to peers or HR.
- **Given:** Any query, API endpoint, log payload, CSV export, or email template.
- **When:** Request details are accessed by peers, HR administrators, or system loggers.
- **Then:** Reason and rejection reason are completely omitted or redacted; peers can never see pending or rejected leaves.
- **Status:** `implemented`
- **Tests:** `tests/privacy/privacy-guard.test.ts`, `tests/unit/redact.test.ts`

## REQ-006: Team Absence Calendar
- **Description:** Colleagues can see approved absences to plan team capacity without exposing private reasons (D2).
- **Given:** An authenticated user accessing `/team-calendar`.
- **When:** Querying absences for a date interval.
- **Then:** Function returns ONLY `user_id`, `display_name`, `start_date`, and `end_date` for teammates sharing the same manager.
- **Status:** `implemented`
- **Tests:** `tests/privacy/privacy-guard.test.ts`

## REQ-007: Append-Only Balance Ledger & Cancellation
- **Description:** Leave balances are computed as `SUM(leave_ledger)` and are never negative. Future approved leaves can be cancelled with balance restoration.
- **Given:** An employee with pending or future approved leave.
- **When:** The employee cancels the request before start date.
- **Then:** Status changes to `cancelled`, ledger records a restoration entry, and available balance is updated.
- **Status:** `implemented`
- **Tests:** `tests/privacy/privacy-guard.test.ts`, `tests/e2e/workflow.spec.ts`

## REQ-008: Automated EL Accrual & Annual Reset
- **Description:** pg_cron schedules monthly EL accrual and 1 Jan reset.
- **Given:** Scheduled cron trigger.
- **When:** Monthly accrual runs on the 1st of each month.
- **Then:** Active profiles receive 1.25 days EL (idempotent per user+month), reset clears balances on 1 Jan.
- **Status:** `implemented`
- **Tests:** `tests/unit/dates.test.ts`

## REQ-009: Offline Operation & Synchronization
- **Description:** Warehouse and transit staff can use the app offline with guaranteed queue synchronization.
- **Given:** No network connectivity (`navigator.onLine === false`).
- **When:** Employee views dashboard or submits a leave request.
- **Then:** Data loads from Dexie IndexedDB cache; submissions enter the outbox with client UUID idempotency keys and flush automatically upon reconnection.
- **Status:** `implemented`
- **Tests:** `tests/e2e/workflow.spec.ts`

## REQ-010: Notification Outbox & Resend Email Delivery
- **Description:** Transactional notifications are queued reliably in Postgres and sent via Edge Function.
- **Given:** A request submission, approval, rejection, or cancellation.
- **When:** Row is inserted into `notification_outbox`.
- **Then:** Edge function dispatches email via Resend with deep link and without reason text; supports `EMAIL_OVERRIDE_TO` for sandbox testing.
- **Status:** `implemented`
- **Tests:** `supabase/functions/send-notification/index.ts`

## REQ-011: Structured Observability & Central Redaction
- **Description:** Production-grade observability with end-to-end Request ID correlation.
- **Given:** Any user action or API request.
- **When:** Logs are written on client, edge, or server.
- **Then:** `x-request-id` is attached, payloads pass through `redact()`, and warn/error events persist to `app_logs`.
- **Status:** `implemented`
- **Tests:** `tests/unit/redact.test.ts`, `tests/privacy/privacy-guard.test.ts`

## REQ-012: HR Monthly Audit Report & CSV Export
- **Description:** HR administrators can review and export monthly leave summaries.
- **Given:** An authenticated HR Admin on `/admin`.
- **When:** Generating the monthly report for year Y and month M.
- **Then:** Table and CSV download show employee name, branch, type, dates, days, status; reasons are strictly excluded.
- **Status:** `implemented`
- **Tests:** `tests/privacy/privacy-guard.test.ts`

## REQ-013: User Administration & Branch Onboarding
- **Description:** HR can invite individual users or perform bulk CSV onboarding across 14 branches.
- **Given:** HR Admin accessing the User Management tab.
- **When:** Inviting a user or uploading CSV.
- **Then:** Profile is linked to correct branch, manager hierarchy is configured, and initial leave quotas are provisioned.
- **Status:** `implemented`
- **Tests:** `app/admin/admin-client.tsx`
