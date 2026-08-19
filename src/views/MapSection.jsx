import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import 'leaflet/dist/leaflet.css'
import { Plus, Pencil, Trash2, MapPin } from 'lucide-react'
import Btn from '../components/Btn.jsx'
import Modal from '../components/Modal.jsx'
import Empty from '../components/Empty.jsx'
import { stampModified } from '../data/schema.js'
import ModifiedBy from '../components/ModifiedBy.jsx'

// Senza questo fix i marker di Leaflet risultano invisibili sotto Vite: il
// bundler non riesce a risolvere i path relativi che la libreria si aspetta.
L.Icon.Default.mergeOptions({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow })

const inputClass = 'border border-[var(--line)] bg-[var(--card)] rounded-2xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40'
const EMPTY_ITEM = { name: '', category: '', mapsLink: '', lat: '', lng: '', note: '' }

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

export default function MapSection({ trip, section, onUpdate, activeDisplayName }) {
  const [form, setForm] = useState(null)
  const online = useOnlineStatus()

  function updateItems(fn) {
    onUpdate((t) => ({ ...t, sections: t.sections.map((s) => (s.id === section.id ? { ...s, items: fn(s.items) } : s)) }))
  }

  function saveItem(e) {
    e.preventDefault()
    const { id, ...raw } = form
    const fields = { ...raw, lat: raw.lat === '' ? null : Number(raw.lat), lng: raw.lng === '' ? null : Number(raw.lng) }
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

  const withCoords = section.items.filter((i) => i.lat !== null && i.lng !== null)
  const center = withCoords.length > 0
    ? [withCoords.reduce((sum, i) => sum + i.lat, 0) / withCoords.length, withCoords.reduce((sum, i) => sum + i.lng, 0) / withCoords.length]
    : null

  return (
    <div className="flex flex-col gap-4 pt-5">
      {online && center && (
        <div className="rounded-[24px] overflow-hidden h-64 border border-[var(--line)]">
          <MapContainer center={center} zoom={12} style={{ height: '100%', width: '100%' }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' />
            {withCoords.map((item) => (
              <Marker key={item.id} position={[item.lat, item.lng]}>
                <Popup>{item.name}</Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      )}

      {section.items.length === 0 && (
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
                <button onClick={() => setForm({ ...item, lat: item.lat ?? '', lng: item.lng ?? '' })} aria-label="Modifica punto" className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)]">
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

      {section.items.length > 0 && (
        <Btn variant="secondary" onClick={() => setForm(EMPTY_ITEM)} className="self-start">
          <Plus size={17} /> Nuovo punto
        </Btn>
      )}

      <Modal open={!!form} title={form?.id ? 'Modifica punto' : 'Nuovo punto'} onClose={() => setForm(null)}>
        {form && (
          <form onSubmit={saveItem} className="flex flex-col gap-3">
            <input required placeholder="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
            <input placeholder="Categoria (spiaggia, ristorante, punto panoramico...)" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputClass} />
            <input placeholder="Link Google/Apple Maps" value={form.mapsLink} onChange={(e) => setForm({ ...form, mapsLink: e.target.value })} className={inputClass} />
            <div className="flex gap-2">
              <input type="number" step="any" placeholder="Latitudine" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} className={`flex-1 ${inputClass}`} />
              <input type="number" step="any" placeholder="Longitudine" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} className={`flex-1 ${inputClass}`} />
            </div>
            <textarea placeholder="Nota" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={inputClass} rows={2} />
            <Btn type="submit">Salva</Btn>
          </form>
        )}
      </Modal>
    </div>
  )
}
