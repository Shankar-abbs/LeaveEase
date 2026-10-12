# Changelog

All notable changes to the LeaveEase application will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.5] - 2026-10-12

### Fixed
- **Form Validations & Human-Friendly Error Messages**:
  - **Employee Onboarding (`/admin`)**: Added client-side validation and live character feedback for temporary passwords (`>= 8` chars), full name, email format, and branch selection. Replaced technical `"Error: Invalid input data"` with the exact validation reason (e.g. `"Temporary password must be at least 8 characters"`) and highlighted invalid fields with inline messages.
  - **Shared Validation Schemas**: Centralized `OnboardEmployeeSchema` in `lib/schemas.ts` and updated `/api/admin/onboard` to return specific field error messages directly.
  - **Account Settings (`/settings`)**: Upgraded password form validation to state exactly which requirement is missing (min length, uppercase, lowercase, numbers/symbols, matching confirmation) instead of generic warnings.
  - **Leave Application (`/apply`)**: Added `formatLeaveSubmissionError()` to translate raw Postgres errors (`OVERLAP_ERROR`, `INSUFFICIENT_BALANCE`, zero leave days, reason length) into friendly, actionable guidance.
  - **Manager Approvals (`/approvals`)**: Added client validation for rejection reasons (minimum 5 chars) and replaced browser `alert()` with inline contextual error banners.
  - **Leave History (`/history`)**: Replaced browser `alert()` on cancellation failure with inline card-level error alerts.
  - **Login (`/login`)**: Converted Supabase auth error codes into friendly user messages.

## [1.0.4] - 2026-10-12

### Fixed
- **Database Migrations 005–007**: Resolved `function uuid_generate_v4() does not exist` across all tables and RPCs by defining native `public.uuid_generate_v4()` mapping to `gen_random_uuid()` and setting table defaults. Fixed PL/pgSQL `SELECT INTO` wiping `v_status` to null on idempotency checks, and aligned `audit_log` insert columns (`actor_id`, `action`, `entity`, `entity_id`, `diff`).

## [1.0.3] - 2026-10-12

### Fixed
- **Settings Page**: Fixed missing `branches.city` query error in `app/settings/page.tsx` that caused users to be redirected to login when clicking Settings.
- **Resend Email Integration**: Configured `EMAIL_OVERRIDE_TO` sandbox delivery to `sankar.abbs@gmail.com` and `EMAIL_FROM=onboarding@resend.dev` across Vercel and Supabase Edge Functions. Added `/api/notifications/dispatch` to deliver outbox notifications reliably.

### Added
- **Global & Route Loading Animations**: Added rich glowing PageLoading states across all App Router routes (`/`, `/dashboard`, `/settings`, `/admin`, `/apply`, `/approvals`, `/history`, `/team-calendar`).
- **Interactive Action Feedback**: Added persistent redirecting and signing-in spinners, progress bars, and route navigation indicators in `app/login/page.tsx` and `components/AppShell.tsx`.

## [1.0.2] - 2026-10-12

### Added
- **Employee Onboarding API & UI**: HR Admin single employee onboarding (`/api/admin/onboard`) and bulk CSV onboarding (`/api/admin/onboard-bulk`) with temporary password generation, auto-granting of initial leave quotas, and copyable credentials cards.
- **Account Settings & Password Management**: Dedicated `/settings` route for all roles with live password validation checklist, self-service password update via `supabase.auth.updateUser()`, and account sign-out.
- **App Navigation**: Added Settings navigation links across desktop top bar and mobile navigation for Employees, Managers, and HR Admins.

## [1.0.1] - 2026-10-12

### Changed
- Upgraded Next.js to 15.5.27 for production security and Vercel compatibility.
- Excluded Playwright E2E suites from Vitest unit runner in `vitest.config.ts`.
- Configured Vercel production environment variables and deployment scripts.

## [1.0.0] - 2026-10-12

### Added
- **REQ-001**: Leave types and quotas (Casual Leave 12 days, Sick Leave 10 days, Earned Leave 15 days).
- **REQ-002**: Leave application form with half-day toggles, weekend skipping, and Zod validation.
- **REQ-003**: Manager approvals screen with real-time pending queue and mandatory rejection reason.
- **REQ-004**: Auto-approval policy setting for Casual Leave below configurable day threshold.
- **REQ-005**: Strict RLS policies and PII redactor guaranteeing leave reason privacy.
- **REQ-006**: Team calendar screen showing "<Name> is away" for peers sharing the same manager.
- **REQ-007**: Append-only leave ledger and self-service cancellation with automatic restoration.
- **REQ-008**: Automated pg_cron monthly EL accrual and 1 Jan annual quota reset.
- **REQ-009**: Progressive Web App offline capabilities using Serwist/Service Worker and Dexie outbox.
- **REQ-010**: Notification outbox and Resend Edge Function with deep links.
- **REQ-011**: End-to-end `x-request-id` correlated structured JSON logging and `/api/health`.
- **REQ-012**: HR Admin monthly report generator and CSV exporter without reason columns.
- **REQ-013**: Branch management across 14 locations and bulk CSV user onboarding.
- **CI/CD & Automation**: GitHub Actions for CI, production deployment, and automated requirement-to-PR workflows.
