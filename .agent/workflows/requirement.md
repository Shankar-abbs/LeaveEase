# Workflow: /requirement <plain English description>

This workflow turns any plain-English requirement into an analysed, implemented, tested, and documented Pull Request.

## 1. Analysis Phase (`req-analyse`)
1. **Parse & Number**: Convert the plain-English request into an atomic REQ-NNN ID with Given / When / Then criteria.
2. **Conflict Check**: Check against:
   - Existing requirements in `requirements/REQUIREMENTS.md`
   - Privacy Invariants in `AGENTS.md` (no leave reason leaks, peer isolation, self-approval prevention)
3. **Impact Estimation**:
   - Database / Schema (new migration needed?)
   - RLS Policies & pgTAP tests
   - UI Screens / Components
   - Offline Outbox / Dexie synchronization
   - Notification templates / Edge functions
   - Logging & Observability
4. **Approval Gate**:
   - If conflicts exist, ALWAYS label `needs-approval` and post questions with proposed defaults.
   - If auto-proceed is checked AND zero conflicts exist, label `approved`.
   - Maintainer approves via label `approved` or `/approve` comment.

## 2. Implementation Phase (`req-implement`)
1. Create Git branch `req/<issue-number>-<slug>`.
2. Update `requirements/REQUIREMENTS.md` with REQ-NNN in status `in_progress`.
3. **Test-First Implementation**:
   - Add unit test or pgTAP test specifying the expected behavior.
   - Implement database changes via **NEW timestamped migration** only (never edit existing ones).
   - Implement backend RPCs / Next.js server actions / frontend UI.
   - Maintain strict redaction for all logging (`createLogger`, `redact()`).
4. **Self-Repair Verification Loop (Max 3 iterations)**:
   ```bash
   pnpm lint
   pnpm typecheck
   pnpm test
   pnpm e2e
   ```
5. **Documentation Update**:
   - Update `requirements/REQUIREMENTS.md` (status: `implemented`, link tests)
   - Update `requirements/TRACEABILITY.md` (REQ -> migration -> code -> tests)
   - Update `requirements/CHANGELOG.md`
   - Update `docs/ASSUMPTIONS.md` (if any ambiguity was resolved)
6. **Open PR**:
   - Run `gh pr create` with full description, REQ IDs, test evidence, rollback plan, and `Closes #<issue-number>`.
