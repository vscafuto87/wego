import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import { renderToStaticMarkup } from 'react-dom/server'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MapPin, LocateFixed, Layers, Maximize2, Minimize2, Mountain, Waves, Utensils, Bed, Star } from 'lucide-react'
import Empty from '../components/Empty.jsx'
import { collectExternalMapPoints } from '../data/schema.js'

export const CATEGORY_COLORS = { schede: '#f97316', lodging: '#a855f7', sentiero: '#16a34a', spiaggia: '#0ea5e9', pasto: '#eab308' }
const CATEGORY_LABELS = { schede: 'Schede', lodging: 'Pernottamento', sentiero: 'Sentieri', spiaggia: 'Spiagge', pasto: 'Ristoranti' }
const CATEGORY_ORDER = ['schede', 'lodging', 'sentiero', 'spiaggia', 'pasto']
const CATEGORY_MARKER_ICONS = { schede: Star, lodging: Bed, sentiero: Mountain, spiaggia: Waves, pasto: Utensils }

// Esportata: la mini-mappa del giorno nell'Itinerario (DayMiniMap) riusa gli
// stessi pallini colorati per sentiero/spiaggia/pasto, invece di un secondo
// stile di marker.
export function dotIcon(color) {
  return L.divIcon({
    className: '',
    html: `<span style="display:block;width:16px;height:16px;border-radius:9999px;background:${color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.4)"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  })
}

// Un'icona per categoria, non solo un colore: così un pin si riconosce a
// colpo d'occhio anche senza aprire il popup o guardare i filtri.
function categoryMarkerIcon(categoryGroup) {
  const color = CATEGORY_COLORS[categoryGroup] ?? CATEGORY_COLORS.schede
  const Icon = CATEGORY_MARKER_ICONS[categoryGroup] ?? Star
  const svg = renderToStaticMarkup(<Icon size={14} color="white" strokeWidth={2.5} />)
  return L.divIcon({
    className: '',
    html: `<span style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:9999px;background:${color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.4)">${svg}</span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13]
  })
}

const CATEGORY_ICONS = Object.fromEntries(CATEGORY_ORDER.map((cat) => [cat, categoryMarkerIcon(cat)]))

const MY_LOCATION_ICON = L.divIcon({
  className: '',
  html: `<span style="position:relative;display:block;width:16px;height:16px;">
    <span style="position:absolute;inset:-6px;border-radius:9999px;background:#2563eb;opacity:0.25"></span>
    <span style="position:absolute;inset:0;border-radius:9999px;background:#2563eb;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.4)"></span>
  </span>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8]
})

function FlyToPosition({ position }) {
  const map = useMap()
  useEffect(() => {
    if (position) map.flyTo([position.lat, position.lng], Math.max(map.getZoom(), 14))
  }, [position, map])
  return null
}

// Passare da card a schermo intero cambia le dimensioni del contenitore, non
// della finestra: Leaflet non se ne accorge da solo, va invalidato a mano.
function ResizeOnFullscreenChange({ fullscreen }) {
  const map = useMap()
  useEffect(() => {
    const raf = requestAnimationFrame(() => map.invalidateSize())
    return () => cancelAnimationFrame(raf)
  }, [fullscreen, map])
  return null
}

const DATE_FMT = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' })
function formatDate(date) {
  return date ? DATE_FMT.format(new Date(date)) : ''
}

function originLabel(point) {
  if (!point.origin) return null
  if (point.origin.sectionTitle) return point.origin.sectionTitle
  return `${formatDate(point.origin.dayDate)} · ${point.origin.itemTitle}`
}

function navigateLabel(point) {
  return point.origin.sectionTitle ? `Vai a ${point.origin.sectionTitle}` : "Vai all'Itinerario"
}

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

// Traduce l'indirizzo di un Pernottamento senza lat/lng in coordinate, solo
// quando c'è rete e solo per mostrarlo sulla mappa: nessun risultato viene
// mai scritto nel viaggio (calcolo derivato, va rifatto a ogni apertura), e
// le richieste sono sequenziali per rispettare il limite di Nominatim (max 1
// al secondo). Se la geocodifica fallisce il punto resta senza pin, in
// silenzio: non è un errore da mostrare.
function useGeocodedAddresses(points, online) {
  const [geocoded, setGeocoded] = useState({})
  const attempted = useRef(new Set())

  useEffect(() => {
    if (!online) return
    const toGeocode = points.filter((p) => p.lat === null && p.lng === null && p.address && !attempted.current.has(p.id))
    if (toGeocode.length === 0) return
    let cancelled = false
    async function run() {
      for (const p of toGeocode) {
        if (cancelled) return
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(p.address)}`)
          const data = await res.json()
          const hit = Array.isArray(data) ? data[0] : null
          if (cancelled) return
          // Segnato "tentato" solo a richiesta conclusa e non annullata: se
          // l'effetto viene rimontato (StrictMode in sviluppo, o un cambio
          // legittimo di `points` a metà fetch) il tentativo va ripetuto, non
          // scartato in silenzio per sempre.
          attempted.current.add(p.id)
          if (hit) setGeocoded((prev) => ({ ...prev, [p.id]: { lat: Number(hit.lat), lng: Number(hit.lon) } }))
        } catch {
          if (!cancelled) attempted.current.add(p.id)
        }
        if (!cancelled) await new Promise((resolve) => setTimeout(resolve, 1100))
      }
    }
    run()
    return () => { cancelled = true }
  }, [points, online])

  return geocoded
}

// forwardRef solo perché Section.jsx passa un ref generico a ogni tipo di
// sezione (childRef.openAdd()): la Mappa non espone più nulla da aggiungere,
// quindi il ref resta inutilizzato.
const MapSection = forwardRef(function MapSection({ trip, onNavigate }, _ref) {
  const online = useOnlineStatus()
  const [myPosition, setMyPosition] = useState(null)
  const [locating, setLocating] = useState(false)
  const [locateError, setLocateError] = useState(null)
  const geolocationAvailable = typeof navigator !== 'undefined' && !!navigator.geolocation
  // Sentieri con curve di livello (OpenTopoMap) al posto della mappa standard:
  // un interruttore manuale, non legato al tipo di viaggio, così vale per
  // qualunque sezione Mappa.
  const [topo, setTopo] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const tileUrl = topo
    ? 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png'
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
  const tileAttribution = topo
    ? '&copy; OpenStreetMap contributors, SRTM | style &copy; OpenTopoMap (CC-BY-SA)'
    : '&copy; OpenStreetMap'

  function locateMe() {
    if (!geolocationAvailable) return
    setLocating(true)
    setLocateError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMyPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocating(false)
      },
      (err) => {
        setLocating(false)
        if (err.code === err.PERMISSION_DENIED) setLocateError('Permesso negato. Attivalo nelle impostazioni del browser per vederti sulla mappa.')
        else if (err.code === err.TIMEOUT) setLocateError('La richiesta è scaduta. Riprova.')
        else setLocateError('Non riusciamo a trovare la tua posizione. Riprova tra un momento.')
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    )
  }

  // I punti arrivano solo da Ristoranti, Pernottamento e Itinerario: la
  // sezione Mappa non ha più punti propri modificabili.
  const points = useMemo(() => collectExternalMapPoints(trip), [trip])
  const geocoded = useGeocodedAddresses(points, online)

  const resolvedPoints = useMemo(() => points.map((p) => {
    if (p.lat !== null && p.lng !== null) return p
    const g = geocoded[p.id]
    return g ? { ...p, lat: g.lat, lng: g.lng } : p
  }), [points, geocoded])

  const withCoords = resolvedPoints.filter((p) => p.lat !== null && p.lng !== null)
  const center = withCoords.length > 0
    ? [withCoords.reduce((sum, p) => sum + p.lat, 0) / withCoords.length, withCoords.reduce((sum, p) => sum + p.lng, 0) / withCoords.length]
    : null

  const availableCategories = CATEGORY_ORDER.filter((cat) => withCoords.some((p) => p.categoryGroup === cat))
  const [hiddenCategories, setHiddenCategories] = useState(new Set())
  function toggleCategory(cat) {
    setHiddenCategories((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }
  const renderedPoints = withCoords.filter((p) => !hiddenCategories.has(p.categoryGroup))

  return (
    <div className="flex flex-col gap-4">
      {online && center && (
        <div className="flex flex-col gap-3">
          {availableCategories.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {availableCategories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => toggleCategory(cat)}
                  aria-pressed={!hiddenCategories.has(cat)}
                  className={`flex items-center gap-1.5 h-11 px-3 rounded-full text-sm border focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 ${
                    hiddenCategories.has(cat) ? 'border-[var(--line)] text-[var(--muted)]' : 'border-transparent bg-[var(--tint)] text-[var(--ink)]'
                  }`}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: CATEGORY_COLORS[cat] }} />
                  {CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
          )}
          <div className={fullscreen ? 'fixed inset-0 z-[1100] bg-[var(--paper)]' : 'relative rounded-[24px] overflow-hidden h-64 border border-[var(--line)]'}>
            <div
              className={`absolute right-3 z-[1000] flex flex-col gap-2 ${fullscreen ? '' : 'top-3'}`}
              style={fullscreen ? { top: 'calc(env(safe-area-inset-top) + 12px)' } : undefined}
            >
              {geolocationAvailable && (
                <button
                  type="button"
                  onClick={locateMe}
                  disabled={locating}
                  aria-label="Mostra dove sono"
                  className="h-11 w-11 flex items-center justify-center rounded-full bg-[var(--card)] text-[var(--ink)] shadow-[0_1px_2px_rgb(var(--ink-rgb)/0.05),0_10px_24px_-14px_rgb(var(--ink-rgb)/0.25)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 disabled:opacity-50"
                >
                  <LocateFixed size={18} className={locating ? 'animate-pulse' : ''} />
                </button>
              )}
              <button
                type="button"
                onClick={() => setTopo((t) => !t)}
                aria-pressed={topo}
                aria-label={topo ? 'Passa alla mappa standard' : 'Passa alla mappa topografica con i sentieri'}
                className="h-11 w-11 flex items-center justify-center rounded-full bg-[var(--card)] shadow-[0_1px_2px_rgb(var(--ink-rgb)/0.05),0_10px_24px_-14px_rgb(var(--ink-rgb)/0.25)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
              >
                <Layers size={18} className={topo ? 'text-[var(--accent)]' : 'text-[var(--ink)]'} />
              </button>
              <button
                type="button"
                onClick={() => setFullscreen((f) => !f)}
                aria-pressed={fullscreen}
                aria-label={fullscreen ? 'Chiudi schermo intero' : 'Apri a schermo intero'}
                className="h-11 w-11 flex items-center justify-center rounded-full bg-[var(--card)] text-[var(--ink)] shadow-[0_1px_2px_rgb(var(--ink-rgb)/0.05),0_10px_24px_-14px_rgb(var(--ink-rgb)/0.25)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
              >
                {fullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
              </button>
            </div>
            <MapContainer center={center} zoom={12} style={{ height: '100%', width: '100%' }}>
              <TileLayer url={tileUrl} attribution={tileAttribution} />
              {topo && (
                // Overlay dei sentieri mappati su OpenStreetMap (CAI compresi):
                // Waymarked Trails li disegna colorati per rete, i locali (i CAI
                // numerati, in genere "lwn") in rosso.
                <TileLayer
                  url="https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png"
                  attribution='Sentieri &copy; <a href="https://waymarkedtrails.org">Waymarked Trails</a>'
                />
              )}
              <ResizeOnFullscreenChange fullscreen={fullscreen} />
              <FlyToPosition position={myPosition} />
              {myPosition && (
                <Marker position={[myPosition.lat, myPosition.lng]} icon={MY_LOCATION_ICON}>
                  <Popup>Sei qui</Popup>
                </Marker>
              )}
              {renderedPoints.map((point) => (
                <Marker
                  key={`${point.categoryGroup}-${point.id}`}
                  position={[point.lat, point.lng]}
                  icon={CATEGORY_ICONS[point.categoryGroup] ?? CATEGORY_ICONS.schede}
                >
                  <Popup>
                    <p className="font-semibold">{point.name || 'Senza nome'}</p>
                    {originLabel(point) && <p className="text-sm text-[var(--muted)]">{originLabel(point)}</p>}
                    {point.link && (
                      <a href={point.link} target="_blank" rel="noreferrer" className="text-sm text-[var(--accent)] underline block mt-1">
                        Apri il link
                      </a>
                    )}
                    {point.origin && onNavigate && (
                      <button
                        type="button"
                        onClick={() => onNavigate(point.origin.tab)}
                        className="text-sm text-[var(--accent)] underline block mt-1"
                      >
                        {navigateLabel(point)}
                      </button>
                    )}
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
          {locateError && <p className="text-sm text-[var(--muted)]">{locateError}</p>}
        </div>
      )}

      {points.length === 0 && (
        <Empty
          icon={MapPin}
          title="Nessun punto ancora"
          detail="I punti compaiono qui non appena aggiungi coordinate o un indirizzo a una scheda in Ristoranti, Pernottamento o Itinerario."
        />
      )}
    </div>
  )
})

export default MapSection
