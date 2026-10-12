# LeaveEase — Leave Management System

**LeaveEase** is a modern, privacy-first, offline-capable leave management application built for **Kestrel Logistics Pvt Ltd** (220 employees across 14 regional branches).

Designed with mobile-first PWA responsiveness for logistics personnel working in transit and warehouses with intermittent connectivity.

---

## Key Features

- **Mobile-First PWA**: Installable web application with offline outbox queuing via Dexie (IndexedDB) and background synchronization.
- **Privacy by Architecture**: Medical and personal leave reasons are strictly isolated via PostgreSQL Row-Level Security (RLS) and cryptographic redaction. Reasons are never leaked to peers, HR reports, logs, or emails.
- **Automated Approvals (D1)**: Optional HR policy for automatic Casual Leave approvals below configured day thresholds.
- **Append-Only Ledger (D6)**: Audit-proof leave ledger tracking grants, monthly EL accruals, approved deductions, and cancellations.
- **Observability**: End-to-end `x-request-id` correlated structured JSON logging with in-app diagnostic views (`/admin/diagnostics`, `/settings/diagnostics`).
- **Autonomous Requirement-to-PR**: GitHub Actions and Antigravity workflow converting plain-English requirements into tested PRs automatically.

---

## Tech Stack

- **Framework**: Next.js 15 (App Router) + React 19 + TypeScript (strict)
- **Styling**: Tailwind CSS with custom dark mode design tokens and 44px touch targets
- **Backend**: Supabase (PostgreSQL 15, Auth, RLS, Edge Functions, pg_cron)
- **Offline**: Dexie.js (IndexedDB) + Service Worker cache
- **Validation**: Zod + React Hook Form
- **Testing**: Vitest (unit/privacy guard), Playwright (E2E), pgTAP (database policies)
- **Email**: Resend transactional email templates dispatched from Supabase Edge Functions

---

## Getting Started

### Prerequisites
- Node.js 20+
- pnpm 9+
- Supabase CLI & GitHub CLI (`gh`)

### Installation
```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev
```

### Running Tests
```bash
# Run unit & privacy-guard tests
pnpm test

# Run type check & linting
pnpm typecheck
pnpm lint

# Run Playwright E2E tests
pnpm e2e
```

---

## Documentation
- [Requirements Specification](requirements/REQUIREMENTS.md)
- [Traceability Matrix](requirements/TRACEABILITY.md)
- [Architectural Decisions & Assumptions](docs/ASSUMPTIONS.md)
- [Debugging & Runbook](docs/DEBUGGING.md)
- [Requirement Automation Guide](docs/WORKFLOW.md)
- [Changelog](requirements/CHANGELOG.md)
