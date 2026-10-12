-- LeaveEase Seed Data (STAGING ONLY)
-- 14 branches, 1 HR admin, 3 managers, 12 employees
-- All users get DEMO_USER_PASSWORD
-- Run: pnpm db:seed

-- ─── NOTE: Run AFTER migrations ─────────────────────────────────────────────
-- The HR admin is created in auth.users separately via the deploy script.
-- This seed creates the profile rows and demo data.

-- ─── Branches (14) ───────────────────────────────────────────────────────────
INSERT INTO public.branches (id, name, code) VALUES
  ('b1000000-0000-0000-0000-000000000001', 'Mumbai HQ',         'MUM'),
  ('b1000000-0000-0000-0000-000000000002', 'Delhi NCR',         'DEL'),
  ('b1000000-0000-0000-0000-000000000003', 'Bangalore',         'BLR'),
  ('b1000000-0000-0000-0000-000000000004', 'Chennai',           'CHN'),
  ('b1000000-0000-0000-0000-000000000005', 'Kolkata',           'KOL'),
  ('b1000000-0000-0000-0000-000000000006', 'Hyderabad',         'HYD'),
  ('b1000000-0000-0000-0000-000000000007', 'Pune',              'PUN'),
  ('b1000000-0000-0000-0000-000000000008', 'Ahmedabad',         'AMD'),
  ('b1000000-0000-0000-0000-000000000009', 'Jaipur',            'JAI'),
  ('b1000000-0000-0000-0000-000000000010', 'Surat',             'SRT'),
  ('b1000000-0000-0000-0000-000000000011', 'Lucknow',           'LKO'),
  ('b1000000-0000-0000-0000-000000000012', 'Bhopal',            'BHO'),
  ('b1000000-0000-0000-0000-000000000013', 'Nagpur',            'NGP'),
  ('b1000000-0000-0000-0000-000000000014', 'Kochi',             'COK')
ON CONFLICT (code) DO NOTHING;

-- ─── Demo Users (created via auth.admin.createUser in create-demo-users.ts) ──
-- Profile UUIDs are fixed so they can be referenced below
-- HR Admin: hr.admin@leaveease.test
-- Manager 1: manager1@leaveease.test (Mumbai)
-- Manager 2: manager2@leaveease.test (Delhi)
-- Manager 3: manager3@leaveease.test (Bangalore)
-- Employees: emp1-12@leaveease.test

-- ─── Profiles (upsert — IDs come from auth.users) ────────────────────────────
-- NOTE: Actual insertion is done by create-demo-users.ts script
-- which creates auth users and inserts profiles with correct UUIDs.
-- This seed file adds leave data for existing profiles.

-- ─── Demo Leave Data (after users are created) ───────────────────────────────
-- Employee 1: some approved CL, pending SL
-- Employee 2: some history

-- This is a placeholder; actual demo leaves are added by create-demo-users.ts

SELECT 'Seed script placeholder. Run create-demo-users.ts for full demo data.' AS message;
