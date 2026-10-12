-- LeaveEase Migration 001: Core Tables
-- branches, profiles, leave_types, policy_settings
-- Created: 2026-10-12

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "pg_net";

-- ─── Branches ───────────────────────────────────────────────────────────────
CREATE TABLE public.branches (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        text NOT NULL UNIQUE,
  code        text NOT NULL UNIQUE CHECK (char_length(code) <= 10),
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

-- ─── Profiles ────────────────────────────────────────────────────────────────
-- Mirrors auth.users.id 1:1
CREATE TABLE public.profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   text NOT NULL CHECK (char_length(full_name) >= 2),
  email       text NOT NULL UNIQUE,
  role        text NOT NULL CHECK (role IN ('employee', 'manager', 'hr_admin')),
  branch_id   uuid REFERENCES public.branches(id),
  manager_id  uuid REFERENCES public.profiles(id),
  joined_on   date NOT NULL DEFAULT CURRENT_DATE,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Prevent self-reference as manager (DB-level, RPC also checks)
ALTER TABLE public.profiles ADD CONSTRAINT no_self_manager
  CHECK (manager_id IS DISTINCT FROM id);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ─── Leave Types ──────────────────────────────────────────────────────────────
CREATE TABLE public.leave_types (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  code            text NOT NULL UNIQUE CHECK (code IN ('CL', 'SL', 'EL')),
  name            text NOT NULL,
  annual_quota    numeric(4,1) NOT NULL CHECK (annual_quota > 0),
  accrues_monthly boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.leave_types ENABLE ROW LEVEL SECURITY;

-- Seed leave types (idempotent)
INSERT INTO public.leave_types (code, name, annual_quota, accrues_monthly) VALUES
  ('CL', 'Casual Leave',  12.0, false),
  ('SL', 'Sick Leave',    10.0, false),
  ('EL', 'Earned Leave',  15.0, true)
ON CONFLICT (code) DO UPDATE SET
  name           = EXCLUDED.name,
  annual_quota   = EXCLUDED.annual_quota,
  accrues_monthly = EXCLUDED.accrues_monthly,
  updated_at     = now();

-- ─── Policy Settings ─────────────────────────────────────────────────────────
-- Single-row table enforced by constraint
CREATE TABLE public.policy_settings (
  id                       uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  auto_approve_below_days  int NOT NULL DEFAULT 0 CHECK (auto_approve_below_days >= 0),
  weekly_off_days          int[] NOT NULL DEFAULT ARRAY[0, 6], -- 0=Sun, 6=Sat
  timezone                 text NOT NULL DEFAULT 'Asia/Kolkata',
  updated_by               uuid REFERENCES public.profiles(id),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  -- Enforce single row
  CONSTRAINT single_row CHECK (id = id)
);

-- Partial unique index: only one row allowed
CREATE UNIQUE INDEX policy_settings_single_row ON public.policy_settings ((true));

ALTER TABLE public.policy_settings ENABLE ROW LEVEL SECURITY;

-- Insert default policy
INSERT INTO public.policy_settings (auto_approve_below_days, weekly_off_days, timezone)
VALUES (0, ARRAY[0, 6], 'Asia/Kolkata')
ON CONFLICT DO NOTHING;

-- ─── updated_at trigger ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_branches_updated_at
  BEFORE UPDATE ON public.branches
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_leave_types_updated_at
  BEFORE UPDATE ON public.leave_types
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_policy_settings_updated_at
  BEFORE UPDATE ON public.policy_settings
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─── Helper: get caller's role from profile ────────────────────────────────
CREATE OR REPLACE FUNCTION public.my_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.my_manager_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT manager_id FROM public.profiles WHERE id = auth.uid();
$$;
