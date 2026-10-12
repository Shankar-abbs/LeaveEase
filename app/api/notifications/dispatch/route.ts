import { NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/logger';

const logger = createLogger({ route: '/api/notifications/dispatch' });

export async function POST(request: Request) {
  try {
    const admin = createAdminSupabaseClient();
    const apiKey = process.env.RESEND_API_KEY;
    const emailFrom = process.env.EMAIL_FROM || 'onboarding@resend.dev';
    const emailOverride = process.env.EMAIL_OVERRIDE_TO || '';
    const appUrl = process.env.APP_URL || 'https://leaveease-mu.vercel.app';

    if (!apiKey) {
      return NextResponse.json({ ok: false, message: 'RESEND_API_KEY not configured' }, { status: 500 });
    }

    // 1. Fetch queued notifications
    const { data: queued, error: fetchErr } = await admin
      .from('notification_outbox')
      .select('id, to_user_id, template, payload, attempts, max_attempts')
      .eq('status', 'queued')
      .order('created_at', { ascending: true })
      .limit(10);

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    if (!queued || queued.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, message: 'No queued notifications' });
    }

    let sentCount = 0;

    for (const notif of queued) {
      // Mark as sending
      await admin
        .from('notification_outbox')
        .update({ status: 'sending', attempts: (notif.attempts ?? 0) + 1 })
        .eq('id', notif.id);

      // Get recipient email
      const { data: recipient } = await admin
        .from('profiles')
        .select('email, full_name')
        .eq('id', notif.to_user_id)
        .maybeSingle();

      if (!recipient?.email) {
        await admin
          .from('notification_outbox')
          .update({ status: 'failed', last_error: 'Recipient profile not found' })
          .eq('id', notif.id);
        continue;
      }

      // Build safe email content without private leave reasons (Privacy Invariant D13)
      const payload: any = notif.payload || {};
      let subject = 'LeaveEase Notification';
      let bodyHtml = '<p>You have a new update in LeaveEase.</p>';
      let ctaUrl = `${appUrl}/dashboard`;
      let ctaText = 'View Dashboard';

      if (notif.template === 'new_request') {
        subject = `New Leave Request: ${payload.requester_name || 'Team Member'}`;
        bodyHtml = `
          <p><strong>${payload.requester_name || 'An employee'}</strong> has submitted a leave request (${payload.days || 1} day(s)).</p>
          <p><strong>Period:</strong> ${payload.start_date || ''} to ${payload.end_date || ''}</p>
          <p>Please review and take action in the approvals dashboard.</p>
        `;
        ctaUrl = `${appUrl}/approvals`;
        ctaText = 'Review Request';
      } else if (notif.template === 'request_approved') {
        subject = 'Leave Request Approved ✓';
        bodyHtml = `
          <p>Great news! Your ${payload.leave_type || ''} leave request for <strong>${payload.days || 1} day(s)</strong> has been approved.</p>
          <p><strong>Dates:</strong> ${payload.start_date || ''} to ${payload.end_date || ''}</p>
        `;
        ctaUrl = `${appUrl}/history`;
        ctaText = 'View Leave History';
      } else if (notif.template === 'request_rejected') {
        subject = 'Leave Request Update';
        bodyHtml = `
          <p>Your leave request for ${payload.days || 1} day(s) was not approved.</p>
          <p>Please log in to LeaveEase to view comments and discuss with your manager.</p>
        `;
        ctaUrl = `${appUrl}/history`;
        ctaText = 'View Request Details';
      } else if (notif.template === 'employee_onboarded') {
        subject = 'Welcome to LeaveEase — Kestrel Logistics';
        bodyHtml = `
          <p>Welcome to LeaveEase! Your employee account has been created.</p>
          <p>You can now apply for Casual, Sick, and Earned Leave and check your balances.</p>
          <p>Please update your password under Account Settings after your first login.</p>
        `;
        ctaUrl = `${appUrl}/login`;
        ctaText = 'Sign In to LeaveEase';
      }

      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"></head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 24px; margin: 0;">
          <div style="max-width: 560px; margin: 0 auto; background: #1e293b; border-radius: 16px; border: 1px solid #334155; padding: 32px;">
            <div style="display: flex; align-items: center; margin-bottom: 24px;">
              <h1 style="color: #6366f1; font-size: 20px; font-weight: bold; margin: 0;">LeaveEase</h1>
            </div>
            <h2 style="color: #ffffff; font-size: 18px; margin-top: 0;">Hi ${recipient.full_name || 'Team Member'},</h2>
            <div style="color: #cbd5e1; font-size: 14px; line-height: 1.6;">
              ${bodyHtml}
            </div>
            <div style="margin-top: 28px;">
              <a href="${ctaUrl}" style="background-color: #4f46e5; color: #ffffff; padding: 12px 24px; border-radius: 10px; font-size: 14px; font-weight: 600; text-decoration: none; display: inline-block;">
                ${ctaText}
              </a>
            </div>
            <hr style="border: 0; border-top: 1px solid #334155; margin: 32px 0 16px;" />
            <p style="color: #64748b; font-size: 12px; margin: 0;">
              LeaveEase • Kestrel Logistics Leave Management • Automated Notification
            </p>
          </div>
        </body>
        </html>
      `;

      let targetEmail = recipient.email;
      let finalSubject = subject;

      if (emailOverride) {
        finalSubject = `[to: ${recipient.email}] ${subject}`;
        targetEmail = emailOverride;
      }

      // Send via Resend
      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: emailFrom,
          to: [targetEmail],
          subject: finalSubject,
          html: emailHtml,
        }),
      });

      if (!resendRes.ok) {
        const errText = await resendRes.text();
        logger.error('Resend dispatch failed', { notifId: notif.id, status: resendRes.status });
        await admin
          .from('notification_outbox')
          .update({ status: 'failed', last_error: `Resend HTTP ${resendRes.status}` })
          .eq('id', notif.id);
      } else {
        await admin
          .from('notification_outbox')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', notif.id);
        sentCount++;
      }
    }

    return NextResponse.json({ ok: true, sent: sentCount });
  } catch (err: any) {
    logger.error('Notification dispatch error', { error: err.message });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Allow GET for simple health/cron ping
export async function GET(request: Request) {
  return POST(request);
}
