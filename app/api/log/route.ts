import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ClientLogEventSchema } from '@/lib/schemas';

/**
 * POST /api/log
 * Receives client-side log entries and stores them via log_event() RPC.
 * Only warn/error levels are persisted. Rate-limited server-side.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = ClientLogEventSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const entry = parsed.data;

    // Only persist warn/error
    if (entry.level === 'debug' || entry.level === 'info') {
      return NextResponse.json({ ok: true });
    }

    const supabase = await createServerSupabaseClient();
    const requestId = request.headers.get('x-request-id') ?? entry.requestId;

    await supabase.rpc('log_event', {
      p_level: entry.level,
      p_service: 'client',
      p_request_id: requestId ?? null,
      p_action: entry.action ?? null,
      p_message: entry.msg,
      p_context: {
        route: entry.route,
        err: entry.err ? { name: entry.err.name, message: entry.err.message } : undefined,
        context: entry.context,
      },
    });

    return NextResponse.json({ ok: true });
  } catch {
    // Silently swallow — client logging must never break the user
    return NextResponse.json({ ok: true });
  }
}
