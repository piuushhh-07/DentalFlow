import { createClient } from "@supabase/supabase-js";

export function createSupabaseTestClient(
  url: string,
  anonKey: string,
  options = { auth: { autoRefreshToken: false, persistSession: false } },
) {
  return createClient(url, anonKey, options);
}
