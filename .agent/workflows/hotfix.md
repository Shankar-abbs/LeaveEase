# Workflow: /hotfix <issue description>

Emergency fix workflow for production/staging incidents.

1. **Reproduce & Trace**:
   - Obtain `x-request-id` or error message from `app_logs` or incident report.
   - Trace in `app_logs` using:
     ```sql
     SELECT * FROM app_logs WHERE request_id = '<id>' ORDER BY at DESC;
     ```
   - Create failing test reproduction in `tests/unit/` or `tests/e2e/`.
2. **Branch**:
   - `git checkout -b hotfix/<incident-id>-<slug>`
3. **Patch**:
   - Apply minimal targeted fix.
   - If DB schema/data patch required, add new timestamped migration.
   - Ensure privacy invariants are unbroken (never leak leave reason, never bypass RLS).
4. **Verify**:
   - Run `pnpm test` and `pnpm e2e`.
5. **Open PR & Deploy**:
   - Open PR titled `[HOTFIX] <description>`.
   - On merge, `deploy.yml` pushes to PROD and performs health verification.
