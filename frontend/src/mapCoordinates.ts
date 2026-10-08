// Web Mercator maps repeat horizontally; serialize clicked pins within the API's longitude bounds.
export function wrapLongitude(longitude: number): number {
  if (!Number.isFinite(longitude)) return NaN
  return ((longitude + 180) % 360 + 360) % 360 - 180
}
