// LeaveEase — send-notification Edge Function (Deno)
// Triggered by database webhook on notification_outbox inserts
// Sends emails via Resend, respects EMAIL_OVERRIDE_TO

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const EMAIL_FROM = Deno.env.get('EMAIL_FROM') || 'LeaveEase <onboarding@resend.dev>';
const EMAIL_OVERRIDE_TO = Deno.env.get('EMAIL_OVERRIDE_TO') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_URL = Deno.env.get('APP_URL') || 'https://leaveease.vercel.app';

// Small typed logger for Edge Functions
function log(level: 'info' | 'warn' | 'error', action: string, msg: string, ctx: Record<string, unknown> = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    service: 'edge',
    action,
    msg,
    // Never log reason, email content, tokens
    ...ctx,
  };
  console[level === 'error' ? 'error' : 'log'](JSON.stringify(entry));
}

interface NotificationRow {
  id: string;
  to_user_id: string;
  template: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
}

Deno.serve(async (req: Request) => {
  try {
    const body = await req.json();
    const notification: NotificationRow = body.record ?? body;

    if (!notification?.id) {
      return new Response('No notification record', { status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Mark as sending
    await supabase
      .from('notification_outbox')
      .update({ status: 'sending', attempts: (notification.attempts ?? 0) + 1 })
      .eq('id', notification.id);

    // Get recipient email
    const { data: recipient } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', notification.to_user_id)
      .single();

    if (!recipient?.email) {
      log('warn', 'send_notification', 'Recipient not found', { notifId: notification.id });
      await supabase.from('notification_outbox')
        .update({ status: 'failed', last_error: 'Recipient not found' })
        .eq('id', notification.id);
      return new Response('Recipient not found', { status: 404 });
    }

    // Build email
    const { subject, html } = buildEmail(notification.template, notification.payload, recipient.full_name, APP_URL);

    // EMAIL_OVERRIDE_TO: redirect to override address, keep intended in subject
    let toEmail = recipient.email;
    let finalSubject = subject;
    if (EMAIL_OVERRIDE_TO) {
      finalSubject = `[to: ${recipient.email}] ${subject}`;
      toEmail = EMAIL_OVERRIDE_TO;
    }

    // Send via Resend
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [toEmail],
        subject: finalSubject,
        html,
      }),
    });

    if (!resendRes.ok) {
      const errBody = await resendRes.text();
      log('error', 'send_notification', 'Resend API error', {
        status: resendRes.status,
        notifId: notification.id,
      });
      await supabase.from('notification_outbox')
        .update({ status: 'failed', last_error: `Resend ${resendRes.status}` })
        .eq('id', notification.id);
      return new Response('Email send failed', { status: 500 });
    }

    await supabase.from('notification_outbox')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', notification.id);

    log('info', 'send_notification', 'Notification sent', { notifId: notification.id, template: notification.template });
    return new Response('OK', { status: 200 });
  } catch (err) {
    log('error', 'send_notification', 'Unhandled error', {
      err: { name: (err as Error).name, message: (err as Error).message },
    });
    return new Response('Internal error', { status: 500 });
  }
});

function buildEmail(
  template: string,
  payload: Record<string, unknown>,
  recipientName: string,
  appUrl: string
): { subject: string; html: string } {
  const deepLink = `${appUrl}/dashboard`;
  const requestLink = payload.request_id ? `${appUrl}/history` : deepLink;

  switch (template) {
    case 'new_request':
      return {
        subject: `Leave Request from ${payload.requester_name ?? 'An Employee'}`,
        html: emailTemplate({
          title: 'New Leave Request',
          greeting: `Hi ${recipientName},`,
          body: `
            <p><strong>${payload.requester_name ?? 'An employee'}</strong> has submitted a ${payload.leave_type ?? ''} leave request:</p>
            <ul>
              <li><strong>Period:</strong> ${payload.start_date} to ${payload.end_date}</li>
              <li><strong>Duration:</strong> ${payload.days} day(s)</li>
            </ul>
            <p>Please review and take action in the app.</p>
          `,
          ctaUrl: `${appUrl}/approvals`,
          ctaText: 'Review Request',
        }),
      };

    case 'request_approved':
      return {
        subject: 'Your Leave Request Has Been Approved',
        html: emailTemplate({
          title: 'Leave Approved ✓',
          greeting: `Hi ${recipientName},`,
          body: `
            <p>Great news! Your ${payload.leave_type ?? ''} leave request has been <strong>approved</strong>.</p>
            <ul>
              <li><strong>Duration:</strong> ${payload.days} day(s)</li>
              ${payload.decided_by === 'system' ? '<li><em>Auto-approved per company policy</em></li>' : `<li><strong>Approved by:</strong> ${payload.decided_by_name ?? 'Your manager'}</li>`}
            </ul>
          `,
          ctaUrl: requestLink,
          ctaText: 'View Details',
        }),
      };

    case 'request_rejected':
      return {
        subject: 'Your Leave Request Has Been Rejected',
        html: emailTemplate({
          title: 'Leave Rejected',
          greeting: `Hi ${recipientName},`,
          body: `
            <p>Your leave request has been <strong>rejected</strong>.</p>
            <p>Please log in to the app to view the reason and discuss with your manager.</p>
            <!-- Rejection reason is NOT included in the email per D13 -->
          `,
          ctaUrl: requestLink,
          ctaText: 'View Request',
        }),
      };

    case 'auto_approved':
      return {
        subject: `Leave Auto-Approved: ${payload.employee_name ?? 'An Employee'}`,
        html: emailTemplate({
          title: 'Leave Auto-Approved (Info)',
          greeting: `Hi ${recipientName},`,
          body: `
            <p>FYI: <strong>${payload.employee_name ?? 'An employee'}</strong>&apos;s ${payload.leave_type ?? ''} leave (${payload.days} day(s)) was <strong>auto-approved</strong> per company policy.</p>
            <p>No action required from you.</p>
          `,
          ctaUrl: `${appUrl}/team-calendar`,
          ctaText: 'View Team Calendar',
        }),
      };

    case 'request_cancelled':
      return {
        subject: `Leave Request Cancelled: ${payload.employee_name ?? 'An Employee'}`,
        html: emailTemplate({
          title: 'Leave Cancelled',
          greeting: `Hi ${recipientName},`,
          body: `
            <p><strong>${payload.employee_name ?? 'An employee'}</strong> has cancelled their leave request (${payload.days} day(s) from ${payload.start_date}).</p>
          `,
          ctaUrl: `${appUrl}/team-calendar`,
          ctaText: 'View Team Calendar',
        }),
      };

    default:
      return {
        subject: 'LeaveEase Notification',
        html: emailTemplate({
          title: 'Notification',
          greeting: `Hi ${recipientName},`,
          body: '<p>You have a new notification in LeaveEase.</p>',
          ctaUrl: deepLink,
          ctaText: 'Open App',
        }),
      };
  }
}

function emailTemplate(opts: {
  title: string;
  greeting: string;
  body: string;
  ctaUrl: string;
  ctaText: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${opts.title}</title>
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:Inter,system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#1e293b;border-radius:16px;border:1px solid rgba(255,255,255,0.1);overflow:hidden;">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#0d9488,#6366f1);padding:28px 32px;">
            <p style="margin:0;color:white;font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase;opacity:0.8;">Kestrel Logistics</p>
            <h1 style="margin:8px 0 0;color:white;font-size:22px;font-weight:700;">${opts.title}</h1>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px;color:#94a3b8;font-size:15px;line-height:1.6;">
            <p style="margin:0 0 16px;color:#f1f5f9;font-size:16px;">${opts.greeting}</p>
            ${opts.body}
            <div style="margin-top:32px;">
              <a href="${opts.ctaUrl}" style="display:inline-block;background:#0d9488;color:white;text-decoration:none;padding:14px 28px;border-radius:12px;font-weight:600;font-size:14px;">${opts.ctaText} →</a>
            </div>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px;border-top:1px solid rgba(255,255,255,0.05);">
            <p style="margin:0;color:#475569;font-size:12px;text-align:center;">
              LeaveEase — Kestrel Logistics | This email was sent automatically. Do not reply.<br>
              <a href="${opts.ctaUrl}" style="color:#0d9488;">Open App</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
