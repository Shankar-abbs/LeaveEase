# Changelog

All notable changes to the LeaveEase application will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
