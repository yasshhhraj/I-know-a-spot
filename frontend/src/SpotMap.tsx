import { useEffect, useState } from 'react'
import { CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import type { LatLngTuple } from 'leaflet'
import { wrapLongitude } from './mapCoordinates'
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

export function SpotMap({ pin, onPick }: { pin: LatLngTuple | null; onPick?: (lat: number, lng: number) => void }) {
  const [tileError, setTileError] = useState(false)
  return <div className="overflow-hidden rounded-lg border border-stone-400">
    <MapContainer center={pin ?? [0, 0]} zoom={pin ? 13 : 2} scrollWheelZoom={false} style={{ height: 260, width: '100%' }}>
      <TileLayer url={tiles} attribution={attribution} eventHandlers={{ tileerror: () => setTileError(true) }} />
      <FollowPin pin={pin} />
      {onPick && <ClickPin onPick={onPick} />}
      {pin && <CircleMarker center={pin} radius={9} pathOptions={{ color: '#064e3b', fillColor: '#059669', fillOpacity: 0.9 }} />}
    </MapContainer>
    {tileError && <p role="status" className="bg-amber-50 px-3 py-2 text-sm text-amber-950">Map tiles could not load fully. The map may be incomplete; you can still enter numeric destination coordinates or use the spot list.</p>}
  </div>
}
