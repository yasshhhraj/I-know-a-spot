import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { isSupabasePublishableKey } from './publicKey'

let client: SupabaseClient | undefined

// Keep client creation lazy so the scaffold can render before credentials exist.
// The publishable key identifies the public client; authorization is enforced server-side.
export function getSupabaseClient(): SupabaseClient {
  if (!client) {
    const url = import.meta.env.VITE_SUPABASE_URL
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

    if (!url || url.includes('YOUR_PROJECT') || !isSupabasePublishableKey(key)) {
      throw new Error('Set a public Supabase URL and sb_publishable_ key in frontend/.env.local')
    }

    client = createClient(url, key)
  }

  return client
}
