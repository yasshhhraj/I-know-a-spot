/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  readonly VITE_PILOT_CENTER_LAT?: string
  readonly VITE_PILOT_CENTER_LON?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
