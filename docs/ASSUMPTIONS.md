# Architectural Assumptions & Resolved Decisions

This document records the resolved ambiguities and operational decisions codified in LeaveEase.

## Decisions (D1–D13)

### D1: Auto-Approval Policy vs Mandatory Manager Sign-off
- **Resolution:** Client requirement 7.2 ("requests of less than 2 days are auto-approved") is implemented as a configurable HR policy: `policy_settings.auto_approve_below_days`.
- **Default:** `0` (Disabled by default, preserving requirement 4.2 that all requests require manager sign-off).
- **Scope:** Applies strictly to Casual Leave (CL). Sick Leave (SL) and Earned Leave (EL) always require manager action. Auto-approvals mark `decided_by = 'system'` and send an informational email to the manager.

### D2: Team Calendar vs Leave Privacy
- **Resolution:** The team calendar displays `approved` colleague absences across the organization for planning and capacity scheduling, excluding self (caller manages own leave on dashboard/history).
- **Privacy Enforcement:** Rendered strictly as `"<Name> is away"` with `start_date` and `end_date`. Leave type, leave reason, and pending/rejected status are never returned by the `team_calendar()` SECURITY DEFINER function.

### D3: Realtime vs Offline Priority
- **Resolution:** Online, balances and pending requests update in real time via Supabase Realtime channels. Offline, the app displays cached data with a "Last synced [time]" indicator and queues offline submissions with status "Pending sync". The server remains the ultimate source of truth.

### D4: Offline Scope & Conflict Resolution
- **Resolution:** Core employee flows work completely offline: viewing dashboard, reading history, browsing calendar, submitting requests, and cancelling own future requests.
- **Idempotency:** Offline submissions generate a client UUID idempotency key stored in Dexie IndexedDB. On network sync, the same RPC is called with the key. Duplicate submissions return the existing request rather than creating duplicates.
- **Failures:** Requests that fail server validation (e.g. balance exhausted concurrently) are marked "Needs attention" with the server's error message.

### D5: Day Counting & Half-Days
- **Resolution:** Day counts support 0.5 increments for start and end days. Non-working days default to Saturday and Sunday (configurable in `policy_settings.weekly_off_days`). Public holidays per state are out of scope for Phase 1.

### D6: Ledger Architecture
- **Resolution:** Leave balance is modeled as an append-only ledger (`leave_ledger`). Balance is calculated as `SUM(amount)` and can never be negative. Deductions occur only upon request approval. Available balance is calculated as `balance - pending`.

### D7: Leave Accrual & Reset
- **Resolution:** CL and SL quotas are granted in full on 1 January (or prorated to nearest 0.5 for mid-year joiners). EL accrues 1.25 days on the 1st of each month via pg_cron. Balances reset on 1 January with no carry-forward.

### D8: Approval Hierarchy
- **Resolution:** Leave requests route to `profiles.manager_id`. A manager's leave routes to their supervisor. Users without an assigned manager route to HR administrators. Self-approval is strictly forbidden in database constraints.

### D9: Overlap Detection
- **Resolution:** Overlaps are checked against the employee's existing `pending` and `approved` requests. Approved leaves can only be cancelled if `start_date > CURRENT_DATE`.

### D10: Rejection Reasons
- **Resolution:** Rejections strictly require a rationale of at least 5 characters. Enforced via database CHECK constraint on `leave_requests`.

### D11: HR Privacy Boundary
- **Resolution:** HR administrators can view leave balances, dates, types, and approval states across all branches, but cannot view individual leave reasons or rejection reasons. Monthly CSV exports omit the reason field.

### D12: Authentication & Onboarding
- **Resolution:** Supabase email + password authentication is used with public signup disabled. User provisioning occurs exclusively through HR single invite or bulk CSV import.

### D13: Notification Architecture
- **Resolution:** Notifications are written to `notification_outbox` in the same transaction as the state change. A Supabase Edge Function dispatches emails via Resend. Email templates include action deep links and never contain medical or personal leave reasons.
