import { useEffect, useState } from 'react'
import { Circle, CircleMarker, MapContainer, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import type { LatLngTuple } from 'leaflet'
import { mapViewport, wrapLongitude } from './mapCoordinates'
import 'leaflet/dist/leaflet.css'

const tiles = import.meta.env.VITE_MAP_TILE_URL?.trim() || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const osmAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
const providerAttribution = import.meta.env.VITE_MAP_TILE_ATTRIBUTION?.trim()
const attribution = providerAttribution ? `${osmAttribution} | ${providerAttribution}` : osmAttribution

function ClickPin({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: e => onPick(e.latlng.lat, wrapLongitude(e.latlng.lng)) })
  return null
}

function FollowPin({ pin }: { pin: LatLngTuple | null }) {
  const map = useMap()
  const lat = pin?.[0] ?? null
  const lng = pin?.[1] ?? null
  useEffect(() => {
    if (lat !== null && lng !== null && Number.isFinite(lat) && lat >= -90 && lat <= 90 && Number.isFinite(lng) && lng >= -180 && lng <= 180) {
      map.setView([lat, lng], 13)
    }
  }, [map, lat, lng])
  return null
}

export function SpotMap({ pin, center, viewCenter, stagedCenter, worldPicker = false, spots = [], selectedId, radiusKm, onSelect, onPick }: {
  pin?: LatLngTuple | null; center?: LatLngTuple | null; viewCenter?: LatLngTuple | null; stagedCenter?: LatLngTuple | null; worldPicker?: boolean; spots?: Array<{ id: string; latitude: number; longitude: number; title: string }>;
  selectedId?: string | null; radiusKm?: number; onSelect?: (id: string) => void; onPick?: (lat: number, lng: number) => void
}) {
  const [tileError, setTileError] = useState(false)
  const viewport = mapViewport(pin ?? null, center ?? null, viewCenter ?? null, worldPicker && !!onPick)
  if (!viewport) return <p role="status" className="rounded-lg border border-stone-400 p-3">Choose a discovery center or destination pin to show the map. No current location is assumed.</p>
  return <div className="overflow-hidden rounded-lg border border-stone-400">
    {viewport.worldOverview && <p className="bg-amber-50 px-3 py-2 text-sm text-amber-950">World overview for choosing a destination pin. This is not your location or a selected pin; tap the map or enter coordinates.</p>}
    <MapContainer center={viewport.center} zoom={viewport.zoom} scrollWheelZoom={false} style={{ height: 260, width: '100%' }}>
      <TileLayer url={tiles} attribution={attribution} eventHandlers={{ tileerror: () => setTileError(true) }} />
      <FollowPin pin={viewport.worldOverview ? null : viewport.center} />
      {onPick && <ClickPin onPick={onPick} />}
      {center && radiusKm && <Circle center={center} radius={radiusKm * 1000} pathOptions={{ color: '#047857', fillColor: '#10b981', fillOpacity: 0.07 }} />}
      {center && <CircleMarker center={center} radius={7} bubblingMouseEvents={false} pathOptions={{ color: '#065f46', fillColor: '#fbbf24', fillOpacity: 1 }}><Tooltip>Selected discovery center</Tooltip></CircleMarker>}
      {stagedCenter && <CircleMarker center={stagedCenter} radius={9} bubblingMouseEvents={false} pathOptions={{ color: '#1d4ed8', fillColor: '#93c5fd', fillOpacity: 1 }}><Tooltip>Staged center — confirm above before results change</Tooltip></CircleMarker>}
      {pin && <CircleMarker center={pin} radius={9} pathOptions={{ color: '#064e3b', fillColor: '#059669', fillOpacity: 0.9 }} />}
      {spots.map(spot => <CircleMarker key={spot.id} center={[spot.latitude, spot.longitude]} radius={spot.id === selectedId ? 11 : 8} bubblingMouseEvents={false} pathOptions={{ color: '#064e3b', fillColor: spot.id === selectedId ? '#fbbf24' : '#059669', fillOpacity: 0.9 }} eventHandlers={{ click: () => onSelect?.(spot.id) }}><Tooltip>{spot.title} — open from the list for keyboard access</Tooltip></CircleMarker>)}
    </MapContainer>
    {tileError && <p role="status" className="bg-amber-50 px-3 py-2 text-sm text-amber-950">Map tiles could not load fully. The map may be incomplete; you can still enter numeric destination coordinates or use the spot list.</p>}
  </div>
}
