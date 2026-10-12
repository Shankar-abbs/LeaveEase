-- LeaveEase Migration 004: Business Logic RPCs
-- get_balances, submit_leave_request, decide_leave_request,
-- cancel_leave_request, team_calendar, hr_monthly_report,
-- run_monthly_accrual, run_annual_reset
-- Created: 2026-10-12

-- ─── get_balances() ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_balances(p_user_id uuid DEFAULT NULL)
RETURNS TABLE (
  leave_type_id   uuid,
  leave_type_code text,
  leave_type_name text,
  balance         numeric,
  pending         numeric,
  available       numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := COALESCE(p_user_id, auth.uid());
  v_caller_role text := public.my_role();
BEGIN
  -- Employees can only get their own balance
  -- Managers can get their direct reports' balances
  -- HR admins can get anyone's balance
  IF v_caller_role = 'employee' AND v_user_id != auth.uid() THEN
    RAISE EXCEPTION 'ACCESS_DENIED: employees can only view their own balance';
  END IF;

  IF v_caller_role = 'manager' THEN
    IF v_user_id != auth.uid() AND NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE id = v_user_id AND manager_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'ACCESS_DENIED: managers can only view direct reports'' balances';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    lt.id AS leave_type_id,
    lt.code AS leave_type_code,
    lt.name AS leave_type_name,
    COALESCE(SUM(ll.amount) FILTER (WHERE ll.amount IS NOT NULL), 0) AS balance,
    COALESCE(SUM(lr_pending.days), 0) AS pending,
    GREATEST(0, COALESCE(SUM(ll.amount) FILTER (WHERE ll.amount IS NOT NULL), 0)
               - COALESCE(SUM(lr_pending.days), 0)) AS available
  FROM public.leave_types lt
  LEFT JOIN public.leave_ledger ll ON ll.leave_type_id = lt.id AND ll.user_id = v_user_id
  LEFT JOIN public.leave_requests lr_pending ON
    lr_pending.leave_type_id = lt.id
    AND lr_pending.user_id = v_user_id
    AND lr_pending.status = 'pending'
  GROUP BY lt.id, lt.code, lt.name
  ORDER BY lt.code;
END;
$$;

-- ─── submit_leave_request() ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_leave_request(
  p_leave_type_code  text,
  p_start_date       date,
  p_end_date         date,
  p_start_half       boolean DEFAULT false,
  p_end_half         boolean DEFAULT false,
  p_reason           text DEFAULT NULL,
  p_idempotency_key  uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id        uuid := auth.uid();
  v_leave_type     RECORD;
  v_policy         RECORD;
  v_days           numeric(4,1);
  v_available      numeric;
  v_manager_id     uuid;
  v_approver_id    uuid;
  v_request_id     uuid;
  v_status         text := 'pending';
  v_decided_by     text;
  v_decided_at     timestamptz;
  v_overlap_count  int;
  v_idem_key       uuid := COALESCE(p_idempotency_key, uuid_generate_v4());
BEGIN
  -- Idempotency check: return existing result if key already used
  SELECT id, status INTO v_request_id, v_status
  FROM public.leave_requests
  WHERE idempotency_key = v_idem_key;

  IF v_request_id IS NOT NULL THEN
    RETURN jsonb_build_object('request_id', v_request_id, 'status', v_status, 'idempotent', true);
  END IF;

  -- Validation
  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: end_date must be >= start_date';
  END IF;

  IF p_reason IS NULL OR char_length(p_reason) < 10 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: reason must be at least 10 characters';
  END IF;

  -- Get leave type
  SELECT * INTO v_leave_type FROM public.leave_types WHERE code = p_leave_type_code;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: invalid leave type %', p_leave_type_code;
  END IF;

  -- Get policy settings
  SELECT * INTO v_policy FROM public.policy_settings LIMIT 1;

  -- Count days (respecting weekly off and half-days)
  -- Simple version: count calendar days minus weekly off days
  WITH calendar AS (
    SELECT generate_series(p_start_date, p_end_date, '1 day'::interval)::date AS d
  )
  SELECT COALESCE(SUM(
    CASE
      WHEN EXTRACT(DOW FROM d) = ANY(v_policy.weekly_off_days) THEN 0
      ELSE 1
    END
  ), 0) INTO v_days FROM calendar;

  -- Apply half-day deductions
  IF p_start_half AND NOT (EXTRACT(DOW FROM p_start_date) = ANY(v_policy.weekly_off_days)) THEN
    v_days := v_days - 0.5;
  END IF;
  IF p_end_half AND p_end_date != p_start_date
     AND NOT (EXTRACT(DOW FROM p_end_date) = ANY(v_policy.weekly_off_days)) THEN
    v_days := v_days - 0.5;
  END IF;
  -- Both halves same day
  IF p_start_half AND p_end_half AND p_start_date = p_end_date
     AND NOT (EXTRACT(DOW FROM p_start_date) = ANY(v_policy.weekly_off_days)) THEN
    v_days := 0.5;
  END IF;

  IF v_days <= 0 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: selected dates result in 0 leave days (check weekly off days)';
  END IF;

  -- Check for overlaps with pending/approved requests
  SELECT COUNT(*) INTO v_overlap_count
  FROM public.leave_requests
  WHERE user_id = v_user_id
    AND status IN ('pending', 'approved')
    AND start_date <= p_end_date
    AND end_date >= p_start_date;

  IF v_overlap_count > 0 THEN
    RAISE EXCEPTION 'OVERLAP_ERROR: overlapping pending or approved leave request exists';
  END IF;

  -- Check available balance
  SELECT available INTO v_available
  FROM public.get_balances(v_user_id)
  WHERE leave_type_id = v_leave_type.id;

  IF v_days > COALESCE(v_available, 0) THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE: requested % days but only % available', v_days, COALESCE(v_available, 0);
  END IF;

  -- Determine approver
  SELECT manager_id INTO v_manager_id FROM public.profiles WHERE id = v_user_id;

  -- If no manager: assign to any HR admin
  IF v_manager_id IS NULL THEN
    SELECT id INTO v_approver_id FROM public.profiles WHERE role = 'hr_admin' AND active = true LIMIT 1;
  ELSE
    v_approver_id := v_manager_id;
  END IF;

  -- Auto-approval check (D1): CL only, strictly below threshold, threshold > 0
  IF v_policy.auto_approve_below_days > 0
     AND p_leave_type_code = 'CL'
     AND v_days < v_policy.auto_approve_below_days THEN
    v_status := 'approved';
    v_decided_by := 'system';
    v_decided_at := now();
  END IF;

  -- Insert request (locked row)
  INSERT INTO public.leave_requests (
    user_id, leave_type_id, start_date, end_date, start_half, end_half,
    days, reason, status, approver_id, decided_by, decided_at, idempotency_key
  ) VALUES (
    v_user_id, v_leave_type.id, p_start_date, p_end_date, p_start_half, p_end_half,
    v_days, p_reason, v_status, v_approver_id, v_decided_by, v_decided_at, v_idem_key
  ) RETURNING id INTO v_request_id;

  -- Deduct from ledger immediately if auto-approved
  IF v_status = 'approved' THEN
    INSERT INTO public.leave_ledger (user_id, leave_type_id, entry_type, amount, request_id, notes)
    VALUES (v_user_id, v_leave_type.id, 'deduction', -v_days, v_request_id, 'auto-approved');
  END IF;

  -- Write audit log
  INSERT INTO public.audit_log (actor_id, action, entity, entity_id, diff)
  VALUES (
    v_user_id,
    'submit',
    'leave_request',
    v_request_id,
    jsonb_build_object(
      'leave_type', p_leave_type_code,
      'start_date', p_start_date,
      'end_date', p_end_date,
      'days', v_days,
      'status', v_status
      -- reason intentionally excluded from audit_log
    )
  );

  -- Queue notification
  IF v_status = 'pending' AND v_approver_id IS NOT NULL THEN
    INSERT INTO public.notification_outbox (to_user_id, template, payload)
    VALUES (
      v_approver_id,
      'new_request',
      jsonb_build_object(
        'request_id', v_request_id,
        'requester_name', (SELECT full_name FROM public.profiles WHERE id = v_user_id),
        'leave_type', p_leave_type_code,
        'start_date', p_start_date,
        'end_date', p_end_date,
        'days', v_days
        -- reason NOT included in notification payload
      )
    );
  ELSIF v_status = 'approved' AND v_approver_id IS NOT NULL THEN
    -- Notify manager of auto-approval
    INSERT INTO public.notification_outbox (to_user_id, template, payload)
    VALUES (
      v_approver_id,
      'auto_approved',
      jsonb_build_object(
        'request_id', v_request_id,
        'employee_name', (SELECT full_name FROM public.profiles WHERE id = v_user_id),
        'leave_type', p_leave_type_code,
        'days', v_days
      )
    );
    -- Notify employee of auto-approval
    INSERT INTO public.notification_outbox (to_user_id, template, payload)
    VALUES (
      v_user_id,
      'request_approved',
      jsonb_build_object(
        'request_id', v_request_id,
        'leave_type', p_leave_type_code,
        'days', v_days,
        'decided_by', 'system'
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'request_id', v_request_id,
    'status', v_status,
    'days', v_days,
    'idempotent', false
  );
END;
$$;

-- ─── decide_leave_request() ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.decide_leave_request(
  p_request_id       uuid,
  p_decision         text, -- 'approved' | 'rejected'
  p_rejection_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id   uuid := auth.uid();
  v_actor_role text := public.my_role();
  v_request    RECORD;
  v_employee   RECORD;
BEGIN
  -- Validate decision
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: decision must be approved or rejected';
  END IF;

  IF p_decision = 'rejected' AND (p_rejection_reason IS NULL OR char_length(p_rejection_reason) < 5) THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: rejection reason must be at least 5 characters';
  END IF;

  -- Lock and fetch request
  SELECT * INTO v_request FROM public.leave_requests
  WHERE id = p_request_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: leave request % not found', p_request_id;
  END IF;

  IF v_request.status != 'pending' THEN
    RAISE EXCEPTION 'INVALID_STATE: request is % — can only decide pending requests', v_request.status;
  END IF;

  -- Authorization check
  SELECT * INTO v_employee FROM public.profiles WHERE id = v_request.user_id;

  -- No self-approval ever
  IF v_actor_id = v_request.user_id THEN
    RAISE EXCEPTION 'ACCESS_DENIED: self-approval is not allowed';
  END IF;

  -- Manager: must be the employee's manager
  IF v_actor_role = 'manager' THEN
    IF v_employee.manager_id != v_actor_id THEN
      RAISE EXCEPTION 'ACCESS_DENIED: you are not the manager of this employee';
    END IF;
  END IF;

  -- HR admin can approve/reject anyone's request (if no manager)
  IF v_actor_role = 'employee' THEN
    RAISE EXCEPTION 'ACCESS_DENIED: employees cannot decide leave requests';
  END IF;

  -- Update request
  UPDATE public.leave_requests SET
    status           = p_decision,
    approver_id      = v_actor_id,
    decided_by       = v_actor_id::text,
    decided_at       = now(),
    rejection_reason = CASE WHEN p_decision = 'rejected' THEN p_rejection_reason ELSE NULL END
  WHERE id = p_request_id;

  -- Ledger entry for approved requests
  IF p_decision = 'approved' THEN
    INSERT INTO public.leave_ledger (user_id, leave_type_id, entry_type, amount, request_id, notes)
    VALUES (v_request.user_id, v_request.leave_type_id, 'deduction', -v_request.days, p_request_id, 'manager-approved');
  END IF;

  -- Audit log
  INSERT INTO public.audit_log (actor_id, action, entity, entity_id, diff)
  VALUES (
    v_actor_id,
    p_decision,
    'leave_request',
    p_request_id,
    jsonb_build_object(
      'days', v_request.days,
      'status', p_decision
      -- rejection_reason intentionally excluded from audit log
    )
  );

  -- Notify employee
  INSERT INTO public.notification_outbox (to_user_id, template, payload)
  VALUES (
    v_request.user_id,
    CASE WHEN p_decision = 'approved' THEN 'request_approved' ELSE 'request_rejected' END,
    jsonb_build_object(
      'request_id', p_request_id,
      'leave_type_id', v_request.leave_type_id,
      'start_date', v_request.start_date,
      'end_date', v_request.end_date,
      'days', v_request.days,
      'decided_by_name', (SELECT full_name FROM public.profiles WHERE id = v_actor_id)
      -- rejection_reason NOT in notification payload (D13)
    )
  );

  RETURN jsonb_build_object('request_id', p_request_id, 'status', p_decision);
END;
$$;

-- ─── cancel_leave_request() ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_leave_request(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_request RECORD;
BEGIN
  -- Lock and fetch
  SELECT * INTO v_request FROM public.leave_requests
  WHERE id = p_request_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: leave request not found';
  END IF;

  -- Only the owner can cancel
  IF v_request.user_id != v_user_id THEN
    RAISE EXCEPTION 'ACCESS_DENIED: you can only cancel your own leave requests';
  END IF;

  IF v_request.status = 'cancelled' THEN
    RETURN jsonb_build_object('request_id', p_request_id, 'status', 'cancelled', 'idempotent', true);
  END IF;

  IF v_request.status = 'rejected' THEN
    RAISE EXCEPTION 'INVALID_STATE: rejected requests cannot be cancelled';
  END IF;

  -- Approved requests: can only cancel if start_date > today
  IF v_request.status = 'approved' AND v_request.start_date <= CURRENT_DATE THEN
    RAISE EXCEPTION 'INVALID_STATE: cannot cancel approved leave that has already started';
  END IF;

  -- Update request status
  UPDATE public.leave_requests SET status = 'cancelled' WHERE id = p_request_id;

  -- Restore balance if approved
  IF v_request.status = 'approved' THEN
    INSERT INTO public.leave_ledger (user_id, leave_type_id, entry_type, amount, request_id, notes)
    VALUES (v_user_id, v_request.leave_type_id, 'restoration', v_request.days, p_request_id, 'cancellation-of-approved');
  END IF;

  -- Audit
  INSERT INTO public.audit_log (actor_id, action, entity, entity_id, diff)
  VALUES (v_user_id, 'cancel', 'leave_request', p_request_id,
    jsonb_build_object('previous_status', v_request.status));

  -- Notify manager of cancellation
  IF v_request.approver_id IS NOT NULL THEN
    INSERT INTO public.notification_outbox (to_user_id, template, payload)
    VALUES (
      v_request.approver_id,
      'request_cancelled',
      jsonb_build_object(
        'request_id', p_request_id,
        'employee_name', (SELECT full_name FROM public.profiles WHERE id = v_user_id),
        'days', v_request.days,
        'start_date', v_request.start_date
      )
    );
  END IF;

  RETURN jsonb_build_object('request_id', p_request_id, 'status', 'cancelled');
END;
$$;

-- ─── team_calendar() ─────────────────────────────────────────────────────────
-- D2: show ONLY approved leave of people sharing the same manager.
-- Returns: user_id, display_name, start_date, end_date ONLY.
-- NEVER returns type, reason, or pending/rejected.
CREATE OR REPLACE FUNCTION public.team_calendar(p_from date, p_to date)
RETURNS TABLE (
  user_id      uuid,
  display_name text,
  start_date   date,
  end_date     date
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id      uuid := auth.uid();
  v_caller_role    text := public.my_role();
  v_caller_manager uuid;
BEGIN
  SELECT manager_id INTO v_caller_manager FROM public.profiles WHERE id = v_caller_id;

  RETURN QUERY
  SELECT
    lr.user_id,
    p.full_name AS display_name,
    lr.start_date,
    lr.end_date
  FROM public.leave_requests lr
  JOIN public.profiles p ON p.id = lr.user_id
  WHERE
    lr.status = 'approved'
    AND lr.start_date <= p_to
    AND lr.end_date >= p_from
    AND (
      -- Manager sees their direct reports
      (v_caller_role = 'manager' AND p.manager_id = v_caller_id)
      OR
      -- Employee sees teammates (same manager) — but NOT themselves (private)
      (v_caller_role = 'employee' AND p.manager_id = v_caller_manager AND p.id != v_caller_id)
      OR
      -- HR admin sees all
      (v_caller_role = 'hr_admin')
    )
    -- Self excluded from calendar visibility (can see own from dashboard/history)
    AND lr.user_id != v_caller_id
  ORDER BY lr.start_date, p.full_name;
END;
$$;

-- ─── hr_monthly_report() ─────────────────────────────────────────────────────
-- D11: HR sees balances, status, dates, type for everyone but NOT reasons.
-- Returns CSV-ready data — reason columns excluded.
CREATE OR REPLACE FUNCTION public.hr_monthly_report(p_year int, p_month int)
RETURNS TABLE (
  employee_name  text,
  email          text,
  branch_name    text,
  leave_type     text,
  start_date     date,
  end_date       date,
  days           numeric,
  status         text,
  decided_at     timestamptz
  -- reason and rejection_reason deliberately excluded
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.my_role() != 'hr_admin' THEN
    RAISE EXCEPTION 'ACCESS_DENIED: hr_monthly_report requires hr_admin role';
  END IF;

  RETURN QUERY
  SELECT
    p.full_name AS employee_name,
    p.email,
    b.name AS branch_name,
    lt.code AS leave_type,
    lr.start_date,
    lr.end_date,
    lr.days,
    lr.status,
    lr.decided_at
    -- reason excluded
  FROM public.leave_requests lr
  JOIN public.profiles p ON p.id = lr.user_id
  LEFT JOIN public.branches b ON b.id = p.branch_id
  JOIN public.leave_types lt ON lt.id = lr.leave_type_id
  WHERE
    EXTRACT(YEAR FROM lr.start_date) = p_year
    AND EXTRACT(MONTH FROM lr.start_date) = p_month
    AND lr.status != 'cancelled'
  ORDER BY p.full_name, lr.start_date;
END;
$$;

-- ─── run_monthly_accrual() ───────────────────────────────────────────────────
-- D7: EL accrues 1.25 days on 1st of each month via pg_cron
-- Idempotent per user+month via leave_ledger_idempotent index
CREATE OR REPLACE FUNCTION public.run_monthly_accrual()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_key text := TO_CHAR(CURRENT_DATE, 'YYYY-MM');
  v_el_type_id uuid;
  v_accrual    numeric(4,1);
  v_user       RECORD;
BEGIN
  SELECT id INTO v_el_type_id FROM public.leave_types WHERE code = 'EL';
  IF v_el_type_id IS NULL THEN RETURN; END IF;

  FOR v_user IN
    SELECT id, joined_on FROM public.profiles WHERE active = true
  LOOP
    -- Compute accrual amount (prorated for joining month)
    v_accrual := 1.25;

    -- Prorate joining month
    IF TO_CHAR(v_user.joined_on, 'YYYY-MM') = v_period_key THEN
      DECLARE
        v_days_in_month int := EXTRACT(DAY FROM (DATE_TRUNC('month', v_user.joined_on) + interval '1 month - 1 day')::date);
        v_days_remaining int := v_days_in_month - EXTRACT(DAY FROM v_user.joined_on)::int + 1;
      BEGIN
        v_accrual := ROUND((1.25 * v_days_remaining / v_days_in_month) * 2) / 2;
      END;
    END IF;

    IF v_accrual <= 0 THEN CONTINUE; END IF;

    -- Idempotent insert
    INSERT INTO public.leave_ledger (user_id, leave_type_id, entry_type, amount, period_key, notes)
    VALUES (v_user.id, v_el_type_id, 'accrual', v_accrual, v_period_key, 'monthly EL accrual')
    ON CONFLICT ON CONSTRAINT leave_ledger_idempotent DO NOTHING;
  END LOOP;

  -- Log the run
  PERFORM public.log_event('info', 'db', NULL, 'run_monthly_accrual',
    format('Monthly EL accrual completed for period %s', v_period_key), '{}');
END;
$$;

-- ─── run_annual_reset() ─────────────────────────────────────────────────────
-- D7: CL/SL granted in full on 1 Jan. EL reset with NO carry-forward.
-- Idempotent per year.
CREATE OR REPLACE FUNCTION public.run_annual_reset()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year        int := EXTRACT(YEAR FROM CURRENT_DATE);
  v_period_key  text := v_year::text || '-annual';
  v_user        RECORD;
  v_lt          RECORD;
  v_current_el  numeric;
  v_prorate     numeric;
  v_days_in_year int := 365;
BEGIN
  FOR v_user IN
    SELECT id, joined_on FROM public.profiles WHERE active = true
  LOOP
    FOR v_lt IN
      SELECT id, code, annual_quota FROM public.leave_types
    LOOP
      IF v_lt.code = 'EL' THEN
        -- Reset: add negative entry to zero out, then grant prorated amount
        SELECT COALESCE(SUM(amount), 0) INTO v_current_el
        FROM public.leave_ledger
        WHERE user_id = v_user.id AND leave_type_id = v_lt.id;

        -- Zero out
        IF v_current_el != 0 THEN
          INSERT INTO public.leave_ledger (user_id, leave_type_id, entry_type, amount, period_key, notes)
          VALUES (v_user.id, v_lt.id, 'adjustment', -v_current_el, v_period_key || '-reset', 'annual EL reset')
          ON CONFLICT DO NOTHING;
        END IF;

        -- No carry-forward: EL starts at 0, accrues monthly
      ELSE
        -- CL/SL: grant full annual quota (prorated for new joiners)
        v_prorate := v_lt.annual_quota;

        IF EXTRACT(YEAR FROM v_user.joined_on) = v_year THEN
          -- Prorated: (12 - joining_month + 1) / 12 * quota, rounded to 0.5
          DECLARE
            v_months_remaining int := 12 - EXTRACT(MONTH FROM v_user.joined_on)::int + 1;
          BEGIN
            v_prorate := ROUND((v_lt.annual_quota / 12.0 * v_months_remaining) * 2) / 2;
          END;
        END IF;

        IF v_prorate > 0 THEN
          INSERT INTO public.leave_ledger (user_id, leave_type_id, entry_type, amount, period_key, notes)
          VALUES (v_user.id, v_lt.id, 'grant', v_prorate, v_period_key, format('annual %s grant', v_lt.code))
          ON CONFLICT ON CONSTRAINT leave_ledger_idempotent DO NOTHING;
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  PERFORM public.log_event('info', 'db', NULL, 'run_annual_reset',
    format('Annual reset completed for %s', v_year), '{}');
END;
$$;

-- ─── pg_cron schedules ───────────────────────────────────────────────────────
-- Monthly EL accrual: 1st of each month at 00:00
SELECT cron.schedule('el-monthly-accrual', '0 0 1 * *', 'SELECT public.run_monthly_accrual()');

-- Annual reset: 1 January at 00:00
SELECT cron.schedule('annual-reset', '0 0 1 1 *', 'SELECT public.run_annual_reset()');

-- Notification retry sweep: every 5 minutes
SELECT cron.schedule('notification-sweep', '*/5 * * * *',
  $$UPDATE public.notification_outbox SET status = 'queued', scheduled_at = now() + interval '1 minute'
    WHERE status = 'failed' AND attempts < max_attempts AND scheduled_at <= now()$$
);
