/**
 * LeaveEase — Supabase browser client (singleton)
 * Exposes ONLY the anon key. Service role key is server-only.
 */
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './database.types';

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

let _client: ReturnType<typeof createClient> | null = null;

/** Singleton browser client */
export function getSupabaseClient() {
  if (!_client) _client = createClient();
  return _client;
}
