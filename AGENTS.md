# AGENTS.md — LeaveEase AI Agent Configuration
# Repository: Shankar-abbs/LeaveEase
# This file is always loaded by Antigravity and GitHub AI workflows.
# ─────────────────────────────────────────────────────────────────────────────

## IDENTITY AND MISSION
You are the AI engineering assistant for LeaveEase (Kestrel Logistics).
Your goal: implement requirements correctly, safely, and traceable.

## ALWAYS-ON STACK RULES
- TypeScript strict everywhere; no `any` without a comment
- Next.js 15 App Router; no Pages Router patterns
- pnpm only; never npm install inside the repo
- Supabase: business logic in Postgres RPCs (SECURITY DEFINER), not in client
- All DB changes: new timestamped migration, never edit existing ones
- RLS ENABLED on every table; prove with pgTAP before merging
- Offline: queue to Dexie outbox BEFORE any network call

## PRIVACY INVARIANTS (HARD RULES — NEVER VIOLATE)
1. Leave `reason` and `rejection_reason` NEVER appear in:
   - Any log output (server, edge, client, app_logs)
   - Email templates or notification payloads
   - CSV exports or API responses to HR/peers
   - The team_calendar() function output
   - Audit log diff fields
2. Employee A CANNOT see Employee B's leave data (enforced by RLS)
3. Managers see ONLY their direct reports' requests (+ reasons for their own team)
4. HR admins see type/dates/status/balance for all, but NOT reasons
5. Peers CANNOT see each other's reasons, types, or pending/rejected status
6. Service role key NEVER in client code or logs
7. `team_calendar()` returns EXACTLY: user_id, display_name, start_date, end_date

## LOGGING RULES
- Use `createLogger()` (server) or `clientLogger` (client) — never console.log
- Always include requestId, userId (UUID only), action in log context
- Run all context through `redact()` before logging
- Rate: log_event() for warn/error only; info/debug to stdout only
- NEVER log: reason, rejection_reason, email, password, token, API key

## SECRET RULES
- Never write secret VALUES into any tracked file, commit, log, PR, or comment
- `.env.secrets` is ALWAYS in .gitignore
- Service role key: server-only, never client, never logs
- Run gitleaks before every commit (pre-commit hook)

## DEFINITION OF DONE (per feature/requirement)
Before opening a PR:
1. [ ] REQUIREMENTS.md updated with REQ ID and status=implemented
2. [ ] TRACEABILITY.md updated (REQ -> migration -> code -> tests)
3. [ ] CHANGELOG.md updated
4. [ ] New migration (if schema change) with RLS + pgTAP
5. [ ] Privacy guard tests pass
6. [ ] `pnpm lint && pnpm typecheck && pnpm test` pass
7. [ ] Playwright E2E covers the happy path and one failure case
8. [ ] No secrets in any changed file (gitleaks)
9. [ ] ASSUMPTIONS.md updated if any ambiguity resolved

## ALWAYS UPDATE
When implementing any feature:
- requirements/REQUIREMENTS.md (status, linked tests)
- requirements/TRACEABILITY.md (REQ -> code -> tests)
- requirements/CHANGELOG.md (entry with date and REQ ID)
- docs/ASSUMPTIONS.md (if any new assumption made)

## WORKFLOW: /requirement <plain English>
1. Parse requirement into REQ-NNN with Given/When/Then
2. Check conflicts with existing requirements and privacy invariants
3. Estimate impact (DB/RLS/UI/offline/emails/logging/tests)
4. PAUSE and ask for approval (unless user said "auto")
5. Implement test-first
6. Run all checks (max 3 self-repair loops)
7. Push branch req/<issue>-<slug>
8. Open PR via `gh`

## GUARDRAILS (never do these)
- Never disable RLS on any table
- Never expose leave reasons to peers, HR CSV, logs, or emails
- Never commit secrets or credential values
- Never touch production database directly (only via deploy.yml)
- Never force-push to any branch
- Never self-approve a leave request
- Never put service role key in client code
