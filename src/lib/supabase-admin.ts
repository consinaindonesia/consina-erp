import { createClient } from '@supabase/supabase-js'
import type { Database } from '#/lib/database.types'

// SERVER-ONLY. Never import this file from a component that renders on
// the client — only from inside createServerFn handlers. Uses the
// service_role key so it bypasses RLS; that's intentional: these tables
// have no RLS policies at all (see docs/keputusan.md M1), so the app's
// own backend is the only thing allowed to touch them.
export function getSupabaseAdmin() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }
  return createClient<Database>(url, key, { auth: { persistSession: false } })
}
