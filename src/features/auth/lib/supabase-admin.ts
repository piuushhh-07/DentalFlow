import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getSupabasePublicEnvironment } from "@/lib/supabase/config";

export function createSupabaseAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("Supabase staff invitations require SUPABASE_SERVICE_ROLE_KEY.");
  }

  const environment = getSupabasePublicEnvironment();
  return createClient(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
