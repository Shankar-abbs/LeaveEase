-- LeaveEase Migration 003: Notification, Audit, App Logs
-- notification_outbox, audit_log, app_logs
-- Created: 2026-10-12

-- ─── Notification Outbox ─────────────────────────────────────────────────────
CREATE TABLE public.notification_outbox (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  to_user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  template      text NOT NULL CHECK (template IN (
    'new_request',        -- to manager: new request filed
    'request_approved',   -- to employee
    'request_rejected',   -- to employee
    'auto_approved',      -- to manager: informational
    'request_cancelled'   -- to manager/employee
  )),
  payload       jsonb NOT NULL DEFAULT '{}',
  status        text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'sent', 'failed')),
  attempts      int NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts  int NOT NULL DEFAULT 5,
  last_error    text,
  scheduled_at  timestamptz NOT NULL DEFAULT now(),
  sent_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notif_status_scheduled ON public.notification_outbox(status, scheduled_at)
  WHERE status IN ('queued', 'failed') AND attempts < max_attempts;

ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_notif_updated_at
  BEFORE UPDATE ON public.notification_outbox
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- No direct access — Edge Function uses service role
CREATE POLICY notif_no_access ON public.notification_outbox
  FOR ALL USING (false);

-- ─── Audit Log ────────────────────────────────────────────────────────────────
-- Business audit trail (who did what, when)
CREATE TABLE public.audit_log (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id    uuid REFERENCES public.profiles(id),
  action      text NOT NULL, -- e.g. 'submit', 'approve', 'reject', 'cancel', 'policy_update'
  entity      text NOT NULL, -- e.g. 'leave_request', 'profile', 'policy_settings'
  entity_id   uuid,
  diff        jsonb DEFAULT '{}',
  at          timestamptz NOT NULL DEFAULT now()
  -- no reason/rejection_reason in diff — enforced by log_event()
);

CREATE INDEX idx_audit_actor ON public.audit_log(actor_id, at DESC);
CREATE INDEX idx_audit_entity ON public.audit_log(entity, entity_id, at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- HR admin can read all audit logs
CREATE POLICY al_hr_select ON public.audit_log
  FOR SELECT USING (public.my_role() = 'hr_admin');

-- Employees can see their own audit events
CREATE POLICY al_own_select ON public.audit_log
  FOR SELECT USING (actor_id = auth.uid() OR entity_id = auth.uid());

-- No direct writes — use RPC
CREATE POLICY al_no_write ON public.audit_log
  FOR ALL USING (false) WITH CHECK (false);

-- ─── App Logs ─────────────────────────────────────────────────────────────────
-- warn/error logs from server and client. 30-day retention via pg_cron.
-- Written only via log_event() RPC (rate-limited, size-limited).
-- Reason/PII NEVER stored here — enforced by log_event().
CREATE TABLE public.app_logs (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  level       text NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error')),
  service     text NOT NULL CHECK (service IN ('web', 'edge', 'db', 'client')),
  request_id  uuid,
  user_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action      text,
  message     text NOT NULL CHECK (char_length(message) <= 2000),
  context     jsonb DEFAULT '{}',
  at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_app_logs_at ON public.app_logs(at DESC);
CREATE INDEX idx_app_logs_request_id ON public.app_logs(request_id) WHERE request_id IS NOT NULL;
CREATE INDEX idx_app_logs_user ON public.app_logs(user_id, at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX idx_app_logs_level ON public.app_logs(level, at DESC);

ALTER TABLE public.app_logs ENABLE ROW LEVEL SECURITY;

-- HR admin only
CREATE POLICY al2_hr_select ON public.app_logs
  FOR SELECT USING (public.my_role() = 'hr_admin');

CREATE POLICY al2_no_write ON public.app_logs
  FOR ALL USING (false) WITH CHECK (false);

-- ─── log_event() RPC ─────────────────────────────────────────────────────────
-- Rate-limited: max 100 entries per user per hour.
-- Size-limited: context truncated to 4KB.
-- NEVER stores reason, rejection_reason, email, tokens — enforced here.
CREATE OR REPLACE FUNCTION public.log_event(
  p_level    text,
  p_service  text,
  p_request_id uuid DEFAULT NULL,
  p_action   text DEFAULT NULL,
  p_message  text DEFAULT NULL,
  p_context  jsonb DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_recent_count int;
BEGIN
  -- Rate limit check
  SELECT COUNT(*) INTO v_recent_count
  FROM public.app_logs
  WHERE user_id = v_user_id
    AND at > now() - interval '1 hour';

  IF v_recent_count >= 100 THEN
    RETURN; -- silently drop
  END IF;

  -- Validate level
  IF p_level NOT IN ('debug', 'info', 'warn', 'error') THEN
    p_level := 'info';
  END IF;

  -- Scrub sensitive keys from context (belt-and-suspenders)
  p_context := p_context
    - 'reason'
    - 'rejection_reason'
    - 'password'
    - 'token'
    - 'email'
    - 'api_key'
    - 'authorization';

  -- Truncate context to ~4KB
  IF octet_length(p_context::text) > 4096 THEN
    p_context := '{}'::jsonb;
  END IF;

  -- Truncate message
  IF p_message IS NOT NULL AND char_length(p_message) > 2000 THEN
    p_message := left(p_message, 2000);
  END IF;

  INSERT INTO public.app_logs (level, service, request_id, user_id, action, message, context)
  VALUES (p_level, p_service, p_request_id, v_user_id, p_action, p_message, p_context);
END;
$$;

-- ─── pg_cron: 30-day retention ────────────────────────────────────────────────
SELECT cron.schedule(
  'app-logs-cleanup',
  '0 2 * * *',  -- daily at 2am
  $$DELETE FROM public.app_logs WHERE at < now() - interval '30 days'$$
);

-- ─── RLS: policy_settings ─────────────────────────────────────────────────────
-- HR admin can read and update
CREATE POLICY ps_hr_all ON public.policy_settings
  FOR ALL USING (public.my_role() = 'hr_admin') WITH CHECK (public.my_role() = 'hr_admin');

-- All authenticated users can read (to know weekly off days, etc.)
CREATE POLICY ps_authenticated_select ON public.policy_settings
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- ─── RLS: branches ─────────────────────────────────────────────────────────────
-- All authenticated users can read branches
CREATE POLICY branches_auth_select ON public.branches
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- HR admin can manage
CREATE POLICY branches_hr_all ON public.branches
  FOR ALL USING (public.my_role() = 'hr_admin') WITH CHECK (public.my_role() = 'hr_admin');

-- ─── RLS: leave_types ─────────────────────────────────────────────────────────
-- All authenticated users can read leave types
CREATE POLICY lt_auth_select ON public.leave_types
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- HR admin can manage
CREATE POLICY lt_hr_all ON public.leave_types
  FOR ALL USING (public.my_role() = 'hr_admin') WITH CHECK (public.my_role() = 'hr_admin');

-- ─── RLS: profiles ────────────────────────────────────────────────────────────
-- Users can read their own profile
CREATE POLICY p_own_select ON public.profiles
  FOR SELECT USING (id = auth.uid());

-- Managers can see their direct reports
CREATE POLICY p_manager_select ON public.profiles
  FOR SELECT USING (
    manager_id = auth.uid() OR
    id = auth.uid()
  );

-- HR admin can see and manage all
CREATE POLICY p_hr_all ON public.profiles
  FOR ALL USING (public.my_role() = 'hr_admin') WITH CHECK (public.my_role() = 'hr_admin');

-- Users can update their own non-sensitive fields (name only)
CREATE POLICY p_own_update ON public.profiles
  FOR UPDATE USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
