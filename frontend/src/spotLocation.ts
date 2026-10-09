export type SpotLocationState =
  | { kind: 'idle' | 'pending' | 'permissionDenied' | 'unavailable' | 'unsupported' }
  | { kind: 'success'; latitude: string; longitude: string }

type Position = { coords: { latitude: number; longitude: number } }
type LocationError = { code: number }
export type LocationPort = { getCurrentPosition(success: (position: Position) => void, failure: (error: LocationError) => void, options: { enableHighAccuracy: boolean; timeout: number; maximumAge: number }): void }

export class SpotLocationController {
  state: SpotLocationState = { kind: 'idle' }
  private revision = 0
  private readonly location: () => LocationPort | undefined
  private readonly update: (state: SpotLocationState) => void

  constructor(location: () => LocationPort | undefined, update: (state: SpotLocationState) => void) {
    this.location = location
    this.update = update
  }

  cancel() { this.revision++; this.set({ kind: 'idle' }) }
  dispose() { this.revision++ }

  request() {
    if (this.state.kind === 'pending') return
    const revision = ++this.revision
    let port: LocationPort | undefined
    try { port = this.location() } catch { /* Browser access may itself fail. */ }
    if (!port || typeof port.getCurrentPosition !== 'function') { this.set({ kind: 'unsupported' }); return }
    this.set({ kind: 'pending' })
    try {
      port.getCurrentPosition(position => {
        if (revision !== this.revision) return
        const lat = position?.coords?.latitude
        const lon = position?.coords?.longitude
        this.set(typeof lat === 'number' && typeof lon === 'number' && Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180
          ? { kind: 'success', latitude: lat.toFixed(6), longitude: lon.toFixed(6) }
          : { kind: 'unavailable' })
      }, error => {
        if (revision === this.revision) this.set({ kind: error?.code === 1 ? 'permissionDenied' : 'unavailable' })
      }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 })
    } catch {
      if (revision === this.revision) this.set({ kind: 'unavailable' })
    }
  }

  private set(state: SpotLocationState) { this.state = state; this.update(state) }
}
