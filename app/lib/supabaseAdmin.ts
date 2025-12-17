import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not configured`);
  return v;
}

let cached: SupabaseClient<any> | null = null;

// Server-side client: uses Service Role key (keep it secret, server-only).
export function getSupabaseAdmin() {
  if (cached) return cached;
  const client = createClient<any>(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  cached = client;
  return client;
}


