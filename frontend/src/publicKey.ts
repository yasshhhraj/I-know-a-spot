// This rejects accidental key-family mixups; it cannot protect a secret already embedded in VITE_ output.
export function isSupabasePublishableKey(value: unknown): value is string {
  return typeof value === 'string' && /^sb_publishable_[A-Za-z0-9_-]+$/.test(value)
}
