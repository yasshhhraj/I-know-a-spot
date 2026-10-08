// Web Mercator maps repeat horizontally; serialize clicked pins within the API's longitude bounds.
export function wrapLongitude(longitude: number): number {
  if (!Number.isFinite(longitude)) return NaN
  return ((longitude + 180) % 360 + 360) % 360 - 180
}

type MapPoint = readonly [number, number] | readonly [number, number, number?]
export function mapViewport(pin: MapPoint | null, center: MapPoint | null, viewCenter: MapPoint | null, worldPicker: boolean): { center: [number, number]; zoom: number; worldOverview: boolean } | null {
  const focus = pin ?? viewCenter ?? center
  if (focus) return { center: [focus[0], focus[1]], zoom: 13, worldOverview: false }
  return worldPicker ? { center: [0, 0], zoom: 2, worldOverview: true } : null
}
