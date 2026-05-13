import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

function build(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
  }
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_t, prop) {
    if (!_client) _client = build();
    return Reflect.get(_client, prop, _client);
  },
});
