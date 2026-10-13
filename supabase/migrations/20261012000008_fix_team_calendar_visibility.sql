-- LeaveEase Migration 008: Fix team_calendar colleague visibility across organization
-- Created: 2026-10-12
-- Ensures all authenticated team members can view approved colleague absences
-- Strictly preserves Privacy Invariants:
--   1. Returns ONLY user_id, display_name, start_date, end_date
--   2. Never returns reason, rejection_reason, leave_type, or pending/rejected status
--   3. Excludes caller's own absences from colleague view (caller manages own on dashboard/history)

CREATE OR REPLACE FUNCTION public.team_calendar(p_from date, p_to date)
RETURNS TABLE (
  user_id      uuid,
  display_name text,
  start_date   date,
  end_date     date
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
BEGIN
  IF v_caller_id IS NULL THEN
    RETURN;
  END IF;

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
    AND lr.user_id != v_caller_id
    AND p.active = true
  ORDER BY lr.start_date, p.full_name;
END;
$$;
