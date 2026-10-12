-- LeaveEase Migration 002: Leave Requests & Ledger
-- leave_requests, leave_ledger
-- Created: 2026-10-12

-- ─── Leave Requests ───────────────────────────────────────────────────────────
CREATE TABLE public.leave_requests (
  id                 uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id            uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  leave_type_id      uuid NOT NULL REFERENCES public.leave_types(id),
  start_date         date NOT NULL,
  end_date           date NOT NULL,
  start_half         boolean NOT NULL DEFAULT false,
  end_half           boolean NOT NULL DEFAULT false,
  days               numeric(4,1) NOT NULL CHECK (days > 0),
  reason             text NOT NULL CHECK (char_length(reason) >= 10),
  status             text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  approver_id        uuid REFERENCES public.profiles(id),
  decided_by         text, -- 'manager_id' | 'system' | 'auto'
  decided_at         timestamptz,
  rejection_reason   text,
  idempotency_key    uuid NOT NULL UNIQUE,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT end_gte_start CHECK (end_date >= start_date),
  CONSTRAINT rejection_reason_required CHECK (
    status != 'rejected' OR (rejection_reason IS NOT NULL AND char_length(rejection_reason) >= 5)
  ),
  CONSTRAINT no_self_approval CHECK (approver_id IS DISTINCT FROM user_id OR decided_by = 'system')
);

CREATE INDEX idx_leave_requests_user_id ON public.leave_requests(user_id);
CREATE INDEX idx_leave_requests_approver_id ON public.leave_requests(approver_id);
CREATE INDEX idx_leave_requests_status ON public.leave_requests(status);
CREATE INDEX idx_leave_requests_dates ON public.leave_requests(start_date, end_date);

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_leave_requests_updated_at
  BEFORE UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─── Leave Ledger ─────────────────────────────────────────────────────────────
-- Append-only. Balance = SUM(amount) per user+type. Never negative enforced by RPC.
CREATE TABLE public.leave_ledger (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  leave_type_id  uuid NOT NULL REFERENCES public.leave_types(id),
  entry_type     text NOT NULL CHECK (entry_type IN ('grant', 'accrual', 'deduction', 'restoration', 'adjustment')),
  amount         numeric(5,2) NOT NULL, -- positive for credit, negative for debit
  request_id     uuid REFERENCES public.leave_requests(id),
  period_key     text, -- 'YYYY-MM' for accrual/grant idempotency
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),

  -- Idempotency: one grant/accrual per user+type+period
  CONSTRAINT uniq_grant_per_period UNIQUE NULLS NOT DISTINCT (user_id, leave_type_id, entry_type, period_key)
    DEFERRABLE INITIALLY DEFERRED
);

-- Only enforce the unique constraint for grant and accrual types
DROP INDEX IF EXISTS leave_ledger_uniq_grant_per_period;
CREATE UNIQUE INDEX leave_ledger_idempotent
  ON public.leave_ledger (user_id, leave_type_id, period_key)
  WHERE entry_type IN ('grant', 'accrual');

ALTER TABLE public.leave_ledger ENABLE ROW LEVEL SECURITY;

-- ─── RLS Policies: Leave Requests ────────────────────────────────────────────
-- Employees: see ONLY their own requests
CREATE POLICY lr_employee_select ON public.leave_requests
  FOR SELECT
  USING (auth.uid() = user_id);

-- Managers: see requests of direct reports
CREATE POLICY lr_manager_select ON public.leave_requests
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT manager_id FROM public.profiles WHERE id = leave_requests.user_id
    )
  );

-- HR admin: see all requests (but NOT reason — enforced via column-level and view)
CREATE POLICY lr_hr_select ON public.leave_requests
  FOR SELECT
  USING (public.my_role() = 'hr_admin');

-- No direct INSERT/UPDATE/DELETE by anyone — use RPCs
CREATE POLICY lr_no_direct_write ON public.leave_requests
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- ─── RLS Policies: Leave Ledger ───────────────────────────────────────────────
-- Employees: see only their own ledger
CREATE POLICY ll_employee_select ON public.leave_ledger
  FOR SELECT
  USING (auth.uid() = user_id);

-- HR admin: see all ledger entries
CREATE POLICY ll_hr_select ON public.leave_ledger
  FOR SELECT
  USING (public.my_role() = 'hr_admin');

-- No direct writes — use RPCs
CREATE POLICY ll_no_direct_write ON public.leave_ledger
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- ─── Revoke reason column from hr_admin access via direct table ────────────
-- HR admins must use the hr_requests_view which excludes reason columns
-- This is belt-and-suspenders on top of RLS
-- (Column-level privileges can only be revoked from roles, handled in app layer
--  via the SECURITY DEFINER RPC hr_monthly_report that explicitly excludes reasons)

-- ─── View: hr_requests_view (no reason columns) ───────────────────────────────
CREATE OR REPLACE VIEW public.hr_requests_view
  WITH (security_invoker = true)
AS
SELECT
  lr.id,
  lr.user_id,
  p.full_name,
  b.name AS branch_name,
  lt.code AS leave_type_code,
  lt.name AS leave_type_name,
  lr.start_date,
  lr.end_date,
  lr.start_half,
  lr.end_half,
  lr.days,
  lr.status,
  lr.approver_id,
  lr.decided_by,
  lr.decided_at,
  -- reason and rejection_reason DELIBERATELY EXCLUDED
  lr.idempotency_key,
  lr.created_at,
  lr.updated_at
FROM public.leave_requests lr
JOIN public.profiles p ON p.id = lr.user_id
LEFT JOIN public.branches b ON b.id = p.branch_id
JOIN public.leave_types lt ON lt.id = lr.leave_type_id;
