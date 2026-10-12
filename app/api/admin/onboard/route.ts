import { NextResponse } from 'next/server';
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/logger';
import { OnboardEmployeeSchema } from '@/lib/schemas';

const logger = createLogger({ route: '/api/admin/onboard' });

export async function POST(request: Request) {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();

  try {
    // 1. Authenticate caller and verify HR Admin role
    const supabase = await createServerSupabaseClient();
    const {
      data: { user: callerUser },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !callerUser) {
      return NextResponse.json({ error: 'Unauthorized: Please sign in' }, { status: 401 });
    }

    const { data: callerProfile, error: profileCheckError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', callerUser.id)
      .single();

    if (profileCheckError || callerProfile?.role !== 'hr_admin') {
      return NextResponse.json(
        { error: 'Forbidden: Only HR Administrators can onboard employees' },
        { status: 403 }
      );
    }

    // 2. Parse and validate payload
    const body = await request.json();
    const validated = OnboardEmployeeSchema.safeParse(body);

    if (!validated.success) {
      const fieldErrors = validated.error.flatten().fieldErrors;
      const firstErrorMessage =
        Object.values(fieldErrors).flat()[0] || 'Please provide valid input details';

      return NextResponse.json(
        { error: firstErrorMessage, details: fieldErrors },
        { status: 400 }
      );
    }

    const { fullName, email, role, branchId, managerId, tempPassword, grantQuotas } = validated.data;
    const normalizedEmail = email.trim().toLowerCase();

    // 3. Admin Supabase client
    const adminClient = createAdminSupabaseClient();

    // 4. Create or update user in Supabase Auth
    let authUserId: string;

    const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
      email: normalizedEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName.trim() },
    });

    if (createError) {
      // Check if user already exists
      if (createError.message.toLowerCase().includes('already registered') || createError.message.toLowerCase().includes('already exists')) {
        // Find existing user id
        const { data: listData } = await adminClient.auth.admin.listUsers();
        const existing = listData?.users?.find(u => u.email?.toLowerCase() === normalizedEmail);

        if (!existing) {
          return NextResponse.json(
            { error: `User with email ${normalizedEmail} exists but could not be retrieved` },
            { status: 400 }
          );
        }

        authUserId = existing.id;

        // Update password for existing user
        const { error: updateAuthErr } = await adminClient.auth.admin.updateUserById(authUserId, {
          password: tempPassword,
          user_metadata: { full_name: fullName.trim() },
        });

        if (updateAuthErr) {
          return NextResponse.json(
            { error: `Failed to update credentials for existing user: ${updateAuthErr.message}` },
            { status: 500 }
          );
        }
      } else {
        return NextResponse.json(
          { error: `Failed to create auth user: ${createError.message}` },
          { status: 400 }
        );
      }
    } else {
      authUserId = createData.user.id;
    }

    // 5. Upsert profile record
    const { error: profileUpsertError } = await adminClient.from('profiles').upsert(
      {
        id: authUserId,
        email: normalizedEmail,
        full_name: fullName.trim(),
        role: role,
        branch_id: branchId,
        manager_id: managerId || null,
        active: true,
        joined_on: new Date().toISOString().split('T')[0],
      },
      { onConflict: 'id' }
    );

    if (profileUpsertError) {
      return NextResponse.json(
        { error: `Failed to save employee profile: ${profileUpsertError.message}` },
        { status: 500 }
      );
    }

    // 6. Grant initial leave balances if requested
    if (grantQuotas) {
      const { data: leaveTypes } = await adminClient.from('leave_types').select('id, code, annual_quota');
      const currentYear = new Date().getFullYear();

      if (leaveTypes && leaveTypes.length > 0) {
        for (const lt of leaveTypes) {
          const grantAmount = lt.code === 'EL' ? 2.5 : Number(lt.annual_quota) || 12;
          try {
            await adminClient.from('leave_ledger').insert({
              user_id: authUserId,
              leave_type_id: lt.id,
              entry_type: 'grant',
              amount: grantAmount,
              period_key: `${currentYear}-onboard`,
              notes: `Initial ${currentYear} allocation on onboarding`,
            });
          } catch {
            // Ignore duplicate grant constraint if already seeded
          }
        }
      }
    }

    // Log without credentials (Privacy invariant)
    logger.info('Employee onboarded successfully by HR Admin', {
      requestId,
      callerId: callerUser.id,
      newUserId: authUserId,
      email: normalizedEmail,
      role,
      branchId,
    });

    return NextResponse.json({
      ok: true,
      message: `Employee ${fullName} (${normalizedEmail}) onboarded successfully!`,
      user: {
        id: authUserId,
        email: normalizedEmail,
        fullName: fullName.trim(),
        role,
      },
    });
  } catch (err: any) {
    logger.error('Unexpected error in employee onboarding', {
      requestId,
      error: err.message,
    });
    return NextResponse.json(
      { error: err.message || 'An unexpected error occurred during onboarding' },
      { status: 500 }
    );
  }
}
