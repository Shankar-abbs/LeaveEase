# Production Debugging & Runbook

This guide describes how to locate and resolve operational issues using structured request correlation.

## 1. Request ID Tracing Architecture
Every HTTP request generates an `x-request-id` (UUIDv4) header in `middleware.ts`. This ID flows across:
1. **Frontend / Browser**: Stored in client logger and rendered on error screens (`Reference: <request-id>`).
2. **Vercel Edge & Serverless Logs**: Displayed as structured JSON metadata.
3. **Database RPC Calls**: Passed into Postgres and stored in `app_logs` and `audit_log`.
4. **Supabase Edge Functions**: Logged in execution output.

### Tracing a Failing Request
When a user reports an issue or error code, obtain the Request ID and query `app_logs`:
```sql
SELECT
  at,
  level,
  service,
  action,
  message,
  context
FROM public.app_logs
WHERE request_id = 'c1234567-89ab-cdef-0123-456789abcdef'
ORDER BY at ASC;
```

---

## 2. Common Runbooks

### Runbook A: Notifications / Emails Not Sending
1. **Check Outbox Queue**:
   ```sql
   SELECT id, to_user_id, template, status, attempts, last_error, updated_at
   FROM public.notification_outbox
   WHERE status IN ('queued', 'failed')
   ORDER BY created_at DESC
   LIMIT 20;
   ```
2. **Verify Edge Function Trigger**:
   - Check if database webhook is triggering `send-notification`.
   - Check Edge Function logs in Supabase dashboard.
   - Verify `RESEND_API_KEY` is set in Edge Function secrets.
   - Check if `EMAIL_OVERRIDE_TO` is active for sandbox delivery.

### Runbook B: Offline Submissions Not Syncing
1. Open the `/settings/diagnostics` screen in the mobile app.
2. Check the **IndexedDB Outbox** table for entries marked `failed` or `queued`.
3. If entries show `[NEEDS ATTENTION]`, inspect the error message (e.g. concurrent leave overlap or balance deduction failure).
4. Tap **Sync Now** to trigger an immediate flush.

### Runbook C: Row-Level Security (RLS) Permission Denied
1. Check caller role:
   ```sql
   SELECT public.my_role();
   ```
2. Ensure user has a valid profile record linked to `auth.users`:
   ```sql
   SELECT id, full_name, email, role, branch_id, manager_id, active
   FROM public.profiles
   WHERE id = 'TARGET-USER-UUID';
   ```
3. Verify manager relationship if an approval failed:
   ```sql
   SELECT id, full_name FROM public.profiles WHERE manager_id = 'MANAGER-USER-UUID';
   ```

### Runbook D: Accrual or Reset Cron Not Executing
1. Inspect `pg_cron` execution history:
   ```sql
   SELECT jobid, runid, job_pid, database, username, command, status, return_message, start_time, end_time
   FROM cron.job_run_details
   ORDER BY start_time DESC
   LIMIT 10;
   ```
2. Manually trigger monthly accrual (safe & idempotent):
   ```sql
   SELECT public.run_monthly_accrual();
   ```
