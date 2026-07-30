import { createClient } from '@supabase/supabase-js'
import type { Database } from '#/lib/database.types'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const supabase = url && key ? createClient<Database>(url, key) : null
