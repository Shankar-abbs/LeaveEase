import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET() {
  const startMs = Date.now();
  const version = process.env.NEXT_PUBLIC_APP_VERSION || process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) || 'local';

  try {
    const supabase = await createServerSupabaseClient();

    // Check DB reachability
    const { data: dbCheck, error: dbError } = await supabase
      .rpc('get_balances')
      .limit(0);

    // Check migration version
    const { data: migVersion } = await supabase
      .from('schema_migrations')
      .select('version')
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    const durationMs = Date.now() - startMs;

    if (dbError) {
      return NextResponse.json({
        status: 'degraded',
        version,
        db: { reachable: false, error: dbError.message },
        durationMs,
        ts: new Date().toISOString(),
      }, { status: 503 });
    }

    return NextResponse.json({
      status: 'ok',
      version,
      db: {
        reachable: true,
        migrationVersion: migVersion?.version ?? 'unknown',
      },
      durationMs,
      ts: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({
      status: 'error',
      version,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - startMs,
      ts: new Date().toISOString(),
    }, { status: 503 });
  }
}
