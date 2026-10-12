-- LeaveEase Migration 005: Fix UUID generation functions and table defaults
-- Created: 2026-10-12
-- Resolves "function uuid_generate_v4() does not exist" across all schemas

-- 1. Ensure public.uuid_generate_v4() exists and maps directly to native gen_random_uuid()
CREATE OR REPLACE FUNCTION public.uuid_generate_v4()
RETURNS uuid
LANGUAGE sql
PARALLEL SAFE
SET search_path = public, pg_catalog
AS $$
  SELECT gen_random_uuid();
$$;

-- 2. Update default expressions on all core tables to native gen_random_uuid()
ALTER TABLE public.branches ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.leave_types ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.policy_settings ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.leave_requests ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.leave_ledger ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.notification_outbox ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.audit_log ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- 3. Replace submit_leave_request RPC to use gen_random_uuid()
CREATE OR REPLACE FUNCTION public.submit_leave_request(
  p_leave_type_code text,
  p_start_date      date,
  p_end_date        date,
  p_start_half      boolean DEFAULT false,
  p_end_half        boolean DEFAULT false,
  p_reason          text DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_user_id        uuid := auth.uid();
  v_leave_type     public.leave_types%ROWTYPE;
  v_policy         public.policy_settings%ROWTYPE;
  v_available      numeric;
  v_days           numeric;
  v_approver_id    uuid;
  v_request_id     uuid;
  v_status         text := 'pending';
  v_decided_by     text;
  v_decided_at     timestamptz;
  v_overlap_count  int;
  v_idem_key       uuid := COALESCE(p_idempotency_key, gen_random_uuid());
BEGIN
  -- Idempotency check: return existing result if key already used
  SELECT id, status INTO v_request_id, v_status
  FROM public.leave_requests
  WHERE idempotency_key = v_idem_key;

  IF v_request_id IS NOT NULL THEN
    RETURN jsonb_build_object('request_id', v_request_id, 'status', v_status, 'idempotent', true);
  END IF;

  -- Ensure status defaults to pending if idempotency check found no row
  v_status := 'pending';

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

  IF v_available IS NULL OR v_available < v_days THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE: requested % days but only % available', v_days, COALESCE(v_available, 0);
  END IF;

  -- Determine approver: employee's manager
  SELECT manager_id INTO v_approver_id FROM public.profiles WHERE id = v_user_id;

  -- D1: Auto-approval check
  -- Applies ONLY to Casual Leave (CL) when auto_approve_below_days > 0 and days < threshold
  IF v_leave_type.code = 'CL'
     AND v_policy.auto_approve_below_days > 0
     AND v_days < v_policy.auto_approve_below_days THEN
    v_status := 'approved';
    v_decided_by := 'auto';
    v_decided_at := now();
  END IF;

  -- Insert leave request
  INSERT INTO public.leave_requests (
    user_id, leave_type_id, start_date, end_date,
    start_half, end_half, days, reason, status,
    approver_id, decided_by, decided_at, idempotency_key
  ) VALUES (
    v_user_id, v_leave_type.id, p_start_date, p_end_date,
    p_start_half, p_end_half, v_days, p_reason, v_status,
    v_approver_id, v_decided_by, v_decided_at, v_idem_key
  )
  RETURNING id INTO v_request_id;

  -- If auto-approved, deduct from ledger immediately
  IF v_status = 'approved' THEN
    INSERT INTO public.leave_ledger (
      user_id, leave_type_id, entry_type, amount, request_id, notes
    ) VALUES (
      v_user_id, v_leave_type.id, 'deduction', -v_days, v_request_id, 'Auto-approved CL'
    );

    -- Notify manager that request was auto-approved
    IF v_approver_id IS NOT NULL THEN
      INSERT INTO public.notification_outbox (to_user_id, template, payload)
      VALUES (
        v_approver_id,
        'auto_approved',
        jsonb_build_object(
          'request_id', v_request_id,
          'employee_name', (SELECT full_name FROM public.profiles WHERE id = v_user_id),
          'days', v_days,
          'leave_type', v_leave_type.name
        )
      );
    END IF;
  ELSE
    -- Notify approver (or HR if no manager)
    IF v_approver_id IS NOT NULL THEN
      INSERT INTO public.notification_outbox (to_user_id, template, payload)
      VALUES (
        v_approver_id,
        'new_request',
        jsonb_build_object(
          'request_id', v_request_id,
          'requester_name', (SELECT full_name FROM public.profiles WHERE id = v_user_id),
          'days', v_days,
          'leave_type', v_leave_type.name,
          'start_date', p_start_date,
          'end_date', p_end_date
        )
      );
    END IF;
  END IF;

  -- Audit log
  INSERT INTO public.audit_log (user_id, action, target_type, target_id, new_data)
  VALUES (
    v_user_id,
    'leave_request.created',
    'leave_request',
    v_request_id,
    jsonb_build_object('days', v_days, 'status', v_status, 'leave_type', v_leave_type.code)
  );

  RETURN jsonb_build_object(
    'request_id', v_request_id,
    'status', v_status,
    'days', v_days,
    'auto_approved', (v_status = 'approved')
  );
END;
$$;
