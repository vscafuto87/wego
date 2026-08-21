import { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { CATEGORY_COLORS, dotIcon } from './MapSection.jsx'

const KIND_LABELS = { sentiero: 'Sentiero', spiaggia: 'Spiaggia', pasto: 'Ristorante' }

function useOnlineStatus() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    function goOnline() { setOnline(true) }
    function goOffline() { setOnline(false) }
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])
  return online
}

// Solo le tappe del giorno con coordinate, così in Itinerario si vede dove
// sono senza dover cambiare schermata e aprire la tab Mappa.
export default function DayMiniMap({ items }) {
  const online = useOnlineStatus()
  const center = useMemo(() => {
    if (items.length === 0) return null
    return [
      items.reduce((sum, it) => sum + it.lat, 0) / items.length,
      items.reduce((sum, it) => sum + it.lng, 0) / items.length
    ]
  }, [items])

  if (!online || !center) return null

  return (
    <div className="relative rounded-[24px] overflow-hidden h-40 border border-[var(--line)]">
      <MapContainer center={center} zoom={12} zoomControl={false} style={{ height: '100%', width: '100%' }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' />
        {items.map((item) => (
          <Marker key={item.id} position={[item.lat, item.lng]} icon={dotIcon(CATEGORY_COLORS[item.kind] ?? CATEGORY_COLORS.sentiero)}>
            <Popup>
              <p className="font-semibold">{item.title}</p>
              {KIND_LABELS[item.kind] && <p className="text-sm text-[var(--muted)]">{KIND_LABELS[item.kind]}</p>}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}
