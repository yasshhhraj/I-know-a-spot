// Only VITE_ variables belong here: Vite embeds them in the public browser bundle.
import { configuredPilotCenter } from './discovery'
export { normalizeCenter } from './discovery'
export type { Center } from './discovery'
export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, '') ?? ''

/** The pilot area is a labelled fallback, never a device location or [0, 0]. */
export const pilotCenter = configuredPilotCenter(import.meta.env.VITE_PILOT_CENTER_LAT, import.meta.env.VITE_PILOT_CENTER_LON)

export function hasApiConfig() {
  return /^https?:\/\/[^/]+/i.test(apiBaseUrl) && !apiBaseUrl.includes('YOUR_')
}
