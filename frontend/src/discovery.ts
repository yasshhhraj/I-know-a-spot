export type Center = { latitude: number; longitude: number }

export function normalizeCenter(latitude: unknown, longitude: unknown): Center | null {
  if (typeof latitude !== 'number' || typeof longitude !== 'number' ||
      !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null
  return { latitude, longitude }
}

export function configuredPilotCenter(lat: string | undefined, lon: string | undefined): Center | null {
  if (!lat?.trim() || !lon?.trim()) return null
  return normalizeCenter(Number(lat), Number(lon))
}
