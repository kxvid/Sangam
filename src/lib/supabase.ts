import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | undefined;

/** Server-only capability. No unscoped table access is granted to this role. */
export function serverDatabase(): SupabaseClient {
  if (typeof window !== 'undefined') throw new Error('Server database unavailable in a browser');
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Database configuration is incomplete');
  client ??= createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
  });
  return client;
}
