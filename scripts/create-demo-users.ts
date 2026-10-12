/**
 * LeaveEase — Demo User Creation Script (STAGING ONLY)
 * Creates 1 HR admin, 3 managers, 12 employees with demo data.
 * Run: npx tsx scripts/create-demo-users.ts
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL_STAGING || process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY_STAGING || process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD || 'Demo@12345';
const HR_ADMIN_EMAIL = process.env.HR_ADMIN_EMAIL || 'hr.admin@leaveease.test';
const HR_ADMIN_PASSWORD = process.env.HR_ADMIN_PASSWORD || process.env.DEMO_USER_PASSWORD || 'Demo@12345';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

interface UserDef {
  email: string;
  password: string;
  full_name: string;
  role: 'employee' | 'manager' | 'hr_admin';
  branch_code: string;
  manager_email?: string;
  joined_on: string;
}

const DEMO_USERS: UserDef[] = [
  // HR Admin
  { email: HR_ADMIN_EMAIL, password: HR_ADMIN_PASSWORD, full_name: 'HR Administrator', role: 'hr_admin', branch_code: 'MUM', joined_on: '2022-01-01' },

  // Managers
  { email: 'manager1@leaveease.test', password: DEMO_PASSWORD, full_name: 'Rahul Sharma', role: 'manager', branch_code: 'MUM', joined_on: '2021-06-01' },
  { email: 'manager2@leaveease.test', password: DEMO_PASSWORD, full_name: 'Priya Patel', role: 'manager', branch_code: 'DEL', joined_on: '2021-09-01' },
  { email: 'manager3@leaveease.test', password: DEMO_PASSWORD, full_name: 'Arun Kumar', role: 'manager', branch_code: 'BLR', joined_on: '2022-03-01' },

  // Employees under Manager 1 (Mumbai)
  { email: 'emp1@leaveease.test', password: DEMO_PASSWORD, full_name: 'Anjali Singh', role: 'employee', branch_code: 'MUM', manager_email: 'manager1@leaveease.test', joined_on: '2022-07-01' },
  { email: 'emp2@leaveease.test', password: DEMO_PASSWORD, full_name: 'Vikram Mehta', role: 'employee', branch_code: 'MUM', manager_email: 'manager1@leaveease.test', joined_on: '2023-01-15' },
  { email: 'emp3@leaveease.test', password: DEMO_PASSWORD, full_name: 'Sunita Rao', role: 'employee', branch_code: 'PUN', manager_email: 'manager1@leaveease.test', joined_on: '2022-11-01' },
  { email: 'emp4@leaveease.test', password: DEMO_PASSWORD, full_name: 'Deepak Joshi', role: 'employee', branch_code: 'MUM', manager_email: 'manager1@leaveease.test', joined_on: '2023-03-10' },

  // Employees under Manager 2 (Delhi)
  { email: 'emp5@leaveease.test', password: DEMO_PASSWORD, full_name: 'Kavitha Nair', role: 'employee', branch_code: 'DEL', manager_email: 'manager2@leaveease.test', joined_on: '2022-08-01' },
  { email: 'emp6@leaveease.test', password: DEMO_PASSWORD, full_name: 'Rajesh Gupta', role: 'employee', branch_code: 'DEL', manager_email: 'manager2@leaveease.test', joined_on: '2023-02-01' },
  { email: 'emp7@leaveease.test', password: DEMO_PASSWORD, full_name: 'Meera Krishnan', role: 'employee', branch_code: 'JAI', manager_email: 'manager2@leaveease.test', joined_on: '2022-10-15' },
  { email: 'emp8@leaveease.test', password: DEMO_PASSWORD, full_name: 'Sanjay Tiwari', role: 'employee', branch_code: 'LKO', manager_email: 'manager2@leaveease.test', joined_on: '2023-05-01' },

  // Employees under Manager 3 (Bangalore)
  { email: 'emp9@leaveease.test',  password: DEMO_PASSWORD, full_name: 'Divya Reddy',   role: 'employee', branch_code: 'BLR', manager_email: 'manager3@leaveease.test', joined_on: '2022-09-01' },
  { email: 'emp10@leaveease.test', password: DEMO_PASSWORD, full_name: 'Ravi Iyer',     role: 'employee', branch_code: 'HYD', manager_email: 'manager3@leaveease.test', joined_on: '2023-01-01' },
  { email: 'emp11@leaveease.test', password: DEMO_PASSWORD, full_name: 'Pooja Desai',   role: 'employee', branch_code: 'BLR', manager_email: 'manager3@leaveease.test', joined_on: '2022-12-01' },
  { email: 'emp12@leaveease.test', password: DEMO_PASSWORD, full_name: 'Karthik Menon', role: 'employee', branch_code: 'COK', manager_email: 'manager3@leaveease.test', joined_on: '2023-04-01' },
];

async function getBranchId(code: string): Promise<string> {
  const { data } = await supabase.from('branches').select('id').eq('code', code).single();
  if (!data) throw new Error(`Branch not found: ${code}`);
  return data.id;
}

async function getUserIdByEmail(email: string): Promise<string | null> {
  const { data } = await supabase.from('profiles').select('id').eq('email', email).single();
  return data?.id ?? null;
}

async function main() {
  console.log('Creating demo users for STAGING...\n');

  const branchCache: Record<string, string> = {};
  const emailToId: Record<string, string> = {};

  // First pass: create auth users and profiles (no manager yet)
  for (const user of DEMO_USERS) {
    if (!branchCache[user.branch_code]) {
      branchCache[user.branch_code] = await getBranchId(user.branch_code);
    }

    // Check if user already exists
    let userId = await getUserIdByEmail(user.email);

    if (!userId) {
      // Create auth user
      const { data: authData, error } = await supabase.auth.admin.createUser({
        email: user.email,
        password: user.password,
        email_confirm: true,
      });

      if (error) {
        console.error(`Failed to create auth user ${user.email}:`, error.message);
        continue;
      }

      userId = authData.user.id;

      // Create profile
      const { error: profileErr } = await supabase.from('profiles').insert({
        id: userId,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        branch_id: branchCache[user.branch_code],
        joined_on: user.joined_on,
        active: true,
      });

      if (profileErr) {
        console.error(`Failed to create profile ${user.email}:`, profileErr.message);
        continue;
      }

      console.log(`✓ Created ${user.role}: ${user.email}`);
    } else {
      console.log(`  Skipping existing: ${user.email}`);
    }

    emailToId[user.email] = userId;
  }

  // Second pass: set manager_id
  for (const user of DEMO_USERS) {
    if (!user.manager_email) continue;
    const userId = emailToId[user.email];
    const managerId = emailToId[user.manager_email];
    if (!userId || !managerId) continue;

    await supabase.from('profiles').update({ manager_id: managerId }).eq('id', userId);
  }

  // Third pass: grant initial leave balances
  console.log('\nGranting initial leave balances...');
  const { data: leaveTypes } = await supabase.from('leave_types').select('*');
  const currentYear = new Date().getFullYear();

  for (const user of DEMO_USERS) {
    const userId = emailToId[user.email];
    if (!userId || !leaveTypes) continue;

    for (const lt of leaveTypes) {
      if (lt.code === 'EL') continue; // EL accrues monthly via cron

      const quota = lt.annual_quota;
      await (supabase.from('leave_ledger') as any).upsert({
        user_id: userId,
        leave_type_id: lt.id,
        entry_type: 'grant',
        amount: quota,
        period_key: `${currentYear}-annual`,
        notes: `Annual ${lt.code} grant (seed)`,
      }, { ignoreDuplicates: true });
    }
  }

  // Add some demo leave requests
  console.log('\nCreating demo leave requests...');
  await addDemoLeaveRequests(emailToId);

  console.log('\n✅ Demo users created successfully!');
  console.log('\nDemo credentials:');
  console.log(`  HR Admin: ${HR_ADMIN_EMAIL} / [see terminal output from deploy]`);
  console.log(`  Manager:  manager1@leaveease.test / ${DEMO_PASSWORD}`);
  console.log(`  Employee: emp1@leaveease.test / ${DEMO_PASSWORD}`);
}

async function addDemoLeaveRequests(emailToId: Record<string, string>) {
  const today = new Date();
  const future = new Date(today);
  future.setDate(today.getDate() + 10);
  const futureStr = future.toISOString().split('T')[0];

  const past = new Date(today);
  past.setDate(today.getDate() - 15);
  const pastStr = past.toISOString().split('T')[0];

  const pastEnd = new Date(past);
  pastEnd.setDate(past.getDate() + 2);
  const pastEndStr = pastEnd.toISOString().split('T')[0];

  const emp1Id = emailToId['emp1@leaveease.test'];
  const manager1Id = emailToId['manager1@leaveease.test'];

  if (emp1Id && manager1Id) {
    // Approved leave in the past (for emp1)
    const { data: lt } = await supabase.from('leave_types').select('id').eq('code', 'CL').single();
    if (lt) {
      await supabase.rpc('submit_leave_request', {
        p_leave_type_code: 'CL',
        p_start_date: pastStr,
        p_end_date: pastEndStr,
        p_start_half: false,
        p_end_half: false,
        p_reason: 'Personal work - demo leave',
        p_idempotency_key: '00000000-0000-0000-0000-000000000001',
      }).returns<any>();
    }
  }
}

main().catch(console.error);
