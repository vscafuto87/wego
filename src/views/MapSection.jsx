import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import 'leaflet/dist/leaflet.css'
import { Pencil, Trash2, MapPin, LocateFixed } from 'lucide-react'
import Btn from '../components/Btn.jsx'
import Modal from '../components/Modal.jsx'
import Empty from '../components/Empty.jsx'
import CoordsInput from '../components/CoordsInput.jsx'
import { stampModified, collectExternalMapPoints } from '../data/schema.js'
import ModifiedBy from '../components/ModifiedBy.jsx'

// Senza questo fix i marker di Leaflet risultano invisibili sotto Vite: il
// bundler non riesce a risolvere i path relativi che la libreria si aspetta.
L.Icon.Default.mergeOptions({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow })

const CATEGORY_COLORS = { schede: '#f97316', lodging: '#a855f7', sentiero: '#16a34a', spiaggia: '#0ea5e9', pasto: '#eab308' }
const CATEGORY_LABELS = { mappa: 'Mappa', schede: 'Schede', lodging: 'Pernottamento', sentiero: 'Sentieri', spiaggia: 'Spiagge', pasto: 'Pasti' }
const CATEGORY_ORDER = ['mappa', 'schede', 'lodging', 'sentiero', 'spiaggia', 'pasto']

function dotIcon(color) {
  return L.divIcon({
    className: '',
    html: `<span style="display:block;width:16px;height:16px;border-radius:9999px;background:${color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.4)"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  })
}

// Nessuna icona per 'mappa': i punti propri restano col marker Leaflet
// standard, editabile, per distinguerli a colpo d'occhio dagli altri.
const CATEGORY_ICONS = Object.fromEntries(Object.entries(CATEGORY_COLORS).map(([key, color]) => [key, dotIcon(color)]))

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

const DATE_FMT = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' })
function formatDate(date) {
  return date ? DATE_FMT.format(new Date(date)) : ''
}

function originLabel(point) {
  if (point.categoryGroup === 'mappa') return point.category || null
  if (point.categoryGroup === 'schede' || point.categoryGroup === 'lodging') return point.origin.sectionTitle
  return `${formatDate(point.origin.dayDate)} · ${point.origin.itemTitle}`
}

function navigateLabel(point) {
  return point.categoryGroup === 'schede' || point.categoryGroup === 'lodging' ? `Vai a ${point.origin.sectionTitle}` : "Vai all'Itinerario"
}

const inputClass = 'border border-[var(--line)] bg-[var(--card)] rounded-2xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40'
const EMPTY_ITEM = { name: '', category: '', mapsLink: '', lat: null, lng: null, note: '' }

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

const MapSection = forwardRef(function MapSection({ trip, section, onUpdate, activeDisplayName, onNavigate }, ref) {
  const [form, setForm] = useState(null)

  useImperativeHandle(ref, () => ({ openAdd: () => setForm(EMPTY_ITEM) }))
  const online = useOnlineStatus()
  const [myPosition, setMyPosition] = useState(null)
  const [locating, setLocating] = useState(false)
  const [locateError, setLocateError] = useState(null)
  const geolocationAvailable = typeof navigator !== 'undefined' && !!navigator.geolocation

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

  function updateItems(fn) {
    onUpdate((t) => ({ ...t, sections: t.sections.map((s) => (s.id === section.id ? { ...s, items: fn(s.items) } : s)) }))
  }

  function saveItem(e) {
    e.preventDefault()
    const { id, ...fields } = form
    updateItems((items) => {
      if (id) return items.map((it) => (it.id === id ? stampModified({ ...it, ...fields }, activeDisplayName) : it))
      return [...items, stampModified({ id: crypto.randomUUID(), ...fields }, activeDisplayName)]
    })
    setForm(null)
  }

  function removeItem(item) {
    if (window.confirm(`Eliminare "${item.name}"? Non si può annullare.`)) {
      updateItems((items) => items.filter((it) => it.id !== item.id))
    }
  }

  const points = useMemo(() => [
    ...section.items.map((p) => ({ ...p, categoryGroup: 'mappa', origin: null })),
    ...collectExternalMapPoints(trip)
  ], [trip, section.items])

  const withCoords = points.filter((p) => p.lat !== null && p.lng !== null)
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
                  {CATEGORY_COLORS[cat] && <span className="h-2.5 w-2.5 rounded-full" style={{ background: CATEGORY_COLORS[cat] }} />}
                  {CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
          )}
          <div className="relative rounded-[24px] overflow-hidden h-64 border border-[var(--line)]">
            {geolocationAvailable && (
              <button
                type="button"
                onClick={locateMe}
                disabled={locating}
                aria-label="Mostra dove sono"
                className="absolute top-3 right-3 z-[1000] h-11 w-11 flex items-center justify-center rounded-full bg-[var(--card)] text-[var(--ink)] shadow-[0_1px_2px_rgb(var(--ink-rgb)/0.05),0_10px_24px_-14px_rgb(var(--ink-rgb)/0.25)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 disabled:opacity-50"
              >
                <LocateFixed size={18} className={locating ? 'animate-pulse' : ''} />
              </button>
            )}
            <MapContainer center={center} zoom={12} style={{ height: '100%', width: '100%' }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' />
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
                  {...(CATEGORY_ICONS[point.categoryGroup] ? { icon: CATEGORY_ICONS[point.categoryGroup] } : {})}
                >
                  <Popup>
                    <p className="font-semibold">{point.name || 'Senza nome'}</p>
                    {originLabel(point) && <p className="text-sm text-[var(--muted)]">{originLabel(point)}</p>}
                    {point.categoryGroup === 'mappa' && point.mapsLink && (
                      <a href={point.mapsLink} target="_blank" rel="noreferrer" className="text-sm text-[var(--accent)] underline block mt-1">
                        Apri in Maps
                      </a>
                    )}
                    {point.categoryGroup !== 'mappa' && point.link && (
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
        <Empty icon={MapPin} title="Nessun punto ancora" detail="Aggiungi i posti da non perdere." action={<Btn onClick={() => setForm(EMPTY_ITEM)}>Aggiungi un punto</Btn>} />
      )}

      <div className="flex flex-col gap-3">
        {section.items.map((item) => (
          <div key={item.id} className="rounded-[24px] p-5 bg-[var(--card)] shadow-[0_1px_2px_rgb(var(--ink-rgb)/0.05),0_10px_24px_-14px_rgb(var(--ink-rgb)/0.25)]">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-display font-semibold text-xl">{item.name || 'Senza nome'}</p>
                {item.category && <p className="text-sm text-[var(--muted)]">{item.category}</p>}
              </div>
              <div className="flex gap-1 -mr-2 -mt-1">
                <button onClick={() => setForm(item)} aria-label="Modifica punto" className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)]">
                  <Pencil size={15} />
                </button>
                <button onClick={() => removeItem(item)} aria-label="Elimina punto" className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)]">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
            {item.note && <p className="text-base mt-2">{item.note}</p>}
            {item.mapsLink && (
              <a href={item.mapsLink} target="_blank" rel="noreferrer" className="text-base text-[var(--accent)] underline mt-2 inline-block">
                Apri in Maps
              </a>
            )}
            <ModifiedBy modifiedBy={item.modifiedBy} modifiedAt={item.modifiedAt} />
          </div>
        ))}
      </div>

      <Modal open={!!form} title={form?.id ? 'Modifica punto' : 'Nuovo punto'} onClose={() => setForm(null)}>
        {form && (
          <form onSubmit={saveItem} className="flex flex-col gap-3">
            <input required placeholder="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
            <input placeholder="Categoria (spiaggia, ristorante, punto panoramico...)" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputClass} />
            <input placeholder="Link Google/Apple Maps" value={form.mapsLink} onChange={(e) => setForm({ ...form, mapsLink: e.target.value })} className={inputClass} />
            <CoordsInput value={{ lat: form.lat, lng: form.lng }} onChange={(coords) => setForm({ ...form, ...coords })} />
            <textarea placeholder="Nota" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={inputClass} rows={2} />
            <Btn type="submit">Salva</Btn>
          </form>
        )}
      </Modal>
    </div>
  )
})

export default MapSection
