# Workflow: /debug <request-id or error symptom>

Step-by-step diagnostic workflow for tracking down issues in LeaveEase.

## 1. Request ID Tracing
Every HTTP request, RPC call, and error log is correlated by `x-request-id` (UUID).
1. Query `app_logs` table:
   ```sql
   SELECT level, service, action, message, context, at
   FROM public.app_logs
   WHERE request_id = 'YOUR-UUID-HERE'
   ORDER BY at ASC;
   ```
2. Query `audit_log` table for business actions taken by the actor:
   ```sql
   SELECT actor_id, action, entity, entity_id, diff, at
   FROM public.audit_log
   WHERE entity_id = 'REQUEST-OR-PROFILE-UUID'
   ORDER BY at DESC;
   ```

## 2. Notification Failures
Inspect `notification_outbox` for delivery issues:
```sql
SELECT id, to_user_id, template, status, attempts, last_error, updated_at
FROM public.notification_outbox
WHERE status = 'failed'
ORDER BY updated_at DESC;
```

## 3. Offline Sync Issues
Inspect local Dexie database in the browser console:
```javascript
const db = new Dexie('leaveease-v1');
db.open().then(async () => {
  const outbox = await db.table('outbox').toArray();
  console.table(outbox);
});
```
Or open the `/settings/diagnostics` screen in the app.
