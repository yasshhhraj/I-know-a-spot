import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | undefined

// Keep client creation lazy so the scaffold can render before credentials exist.
// The publishable key identifies the public client; authorization is enforced server-side.
export function getSupabaseClient(): SupabaseClient {
  if (!client) {
    const url = import.meta.env.VITE_SUPABASE_URL
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

    if (!url || !key || url.includes('YOUR_PROJECT') || key.includes('YOUR_PUBLIC')) {
      throw new Error('Set public Supabase URL and publishable key in frontend/.env.local')
    }

    client = createClient(url, key)
  }

  return client
}
