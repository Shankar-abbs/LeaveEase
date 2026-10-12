import { NextResponse } from 'next/server';
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/logger';

const logger = createLogger({ route: '/api/admin/onboard-bulk' });

export async function POST(request: Request) {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user: callerUser },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !callerUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', callerUser.id)
      .single();

    if (callerProfile?.role !== 'hr_admin') {
      return NextResponse.json(
        { error: 'Forbidden: Only HR Administrators can execute bulk onboarding' },
        { status: 403 }
      );
    }

    const { csvText } = await request.json();
    if (!csvText || typeof csvText !== 'string') {
      return NextResponse.json({ error: 'CSV text content is required' }, { status: 400 });
    }

    const adminClient = createAdminSupabaseClient();

    // Cache branches and managers for fast lookups
    const { data: branches } = await adminClient.from('branches').select('id, code');
    const branchMap = new Map((branches || []).map((b) => [b.code.toUpperCase(), b.id]));
    const defaultBranchId = branches?.[0]?.id;

    const { data: managers } = await adminClient.from('profiles').select('id, email').eq('role', 'manager');
    const managerMap = new Map((managers || []).map((m) => [m.email.toLowerCase(), m.id]));

    const { data: leaveTypes } = await adminClient.from('leave_types').select('id, code, annual_quota');
    const currentYear = new Date().getFullYear();

    const lines = csvText.trim().split('\n');
    const results: Array<{ email: string; name: string; status: 'created' | 'error'; message?: string; tempPassword?: string }> = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      // Skip header if present
      if (i === 0 && line.toLowerCase().includes('email')) continue;

      const [email, fullName, branchCode, managerEmail, roleInput, customPassword] = line.split(',').map((s) => s.trim());
      if (!email || !fullName) continue;

      const normalizedEmail = email.toLowerCase();
      const role = roleInput === 'manager' || roleInput === 'hr_admin' ? roleInput : 'employee';
      const branchId = branchMap.get((branchCode || '').toUpperCase()) || defaultBranchId;
      const managerId = managerMap.get((managerEmail || '').toLowerCase()) || null;
      const tempPassword = customPassword && customPassword.length >= 8 ? customPassword : `Temp@Kestrel${Math.floor(1000 + Math.random() * 9000)}!`;

      try {
        let authUserId: string;
        const { data: authData, error: createError } = await adminClient.auth.admin.createUser({
          email: normalizedEmail,
          password: tempPassword,
          email_confirm: true,
          user_metadata: { full_name: fullName },
        });

        if (createError) {
          if (createError.message.toLowerCase().includes('already registered')) {
            const { data: listData } = await adminClient.auth.admin.listUsers();
            const existing = listData?.users?.find((u) => u.email?.toLowerCase() === normalizedEmail);
            if (existing) {
              authUserId = existing.id;
              await adminClient.auth.admin.updateUserById(authUserId, { password: tempPassword });
            } else {
              throw createError;
            }
          } else {
            throw createError;
          }
        } else {
          authUserId = authData.user.id;
        }

        // Upsert profile
        await adminClient.from('profiles').upsert(
          {
            id: authUserId,
            email: normalizedEmail,
            full_name: fullName,
            role,
            branch_id: branchId,
            manager_id: managerId,
            active: true,
            joined_on: new Date().toISOString().split('T')[0],
          },
          { onConflict: 'id' }
        );

        // Grant initial quotas
        if (leaveTypes) {
          for (const lt of leaveTypes) {
            const grantAmount = lt.code === 'EL' ? 2.5 : Number(lt.annual_quota) || 12;
            try {
              await adminClient.from('leave_ledger').insert({
                user_id: authUserId,
                leave_type_id: lt.id,
                entry_type: 'grant',
                amount: grantAmount,
                period_key: `${currentYear}-bulk`,
                notes: `Initial ${currentYear} allocation on bulk onboarding`,
              });
            } catch {}
          }
        }

        results.push({ email: normalizedEmail, name: fullName, status: 'created', tempPassword });
      } catch (rowErr: any) {
        results.push({ email: normalizedEmail, name: fullName, status: 'error', message: rowErr.message });
      }
    }

    const succeeded = results.filter((r) => r.status === 'created').length;
    const failed = results.filter((r) => r.status === 'error').length;

    logger.info('Bulk employee onboarding executed', {
      requestId,
      callerId: callerUser.id,
      total: results.length,
      succeeded,
      failed,
    });

    return NextResponse.json({
      ok: true,
      total: results.length,
      succeeded,
      failed,
      results,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Bulk onboarding failed' }, { status: 500 });
  }
}
