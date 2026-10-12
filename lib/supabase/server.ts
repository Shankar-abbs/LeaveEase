/**
 * LeaveEase — Supabase server client (Next.js App Router)
 * Uses @supabase/ssr with cookie-based session handling.
 * Service role key used only in server-side admin operations.
 */
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

/** Standard server client — uses anon key, respects RLS */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component — cookies are read-only; session refresh handled by middleware
          }
        },
      },
    }
  );
}

/** Admin client — service role key, bypasses RLS. SERVER-ONLY. Never import in client code. */
export function createAdminSupabaseClient() {
  if (typeof window !== 'undefined') {
    throw new Error('Admin Supabase client must only be used server-side');
  }
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
