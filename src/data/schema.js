const PALETTES = ['mountain', 'sea', 'city', 'wild']
const ICONS = ['map', 'check', 'note', 'ticket', 'food', 'bed', 'bus', 'star', 'people']
const SECTION_TYPES = ['cards', 'checklist', 'notes', 'transport', 'lodging', 'map']

const DAY_ITEM_KINDS = ['', 'sentiero', 'spiaggia', 'pasto']

const KIND_FIELDS = {
  sentiero: ['durata', 'dislivello', 'difficolta', 'lat', 'lng'],
  spiaggia: ['accesso', 'servizi', 'lat', 'lng'],
  pasto: ['luogo', 'prenotato', 'lat', 'lng']
}

export function dayItemFieldsForKind(kind) {
  return KIND_FIELDS[kind] ?? []
}

function makeId() {
  return crypto.randomUUID()
}

function str(value) {
  return typeof value === 'string' ? value : ''
}

function arr(value) {
  return Array.isArray(value) ? value : []
}

function toCoord(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizeDayItem(raw) {
  const item = raw && typeof raw === 'object' ? raw : {}
  const kind = DAY_ITEM_KINDS.includes(item.kind) ? item.kind : ''
  const base = {
    id: makeId(),
    time: str(item.time),
    title: str(item.title),
    kind,
    detail: str(item.detail),
    link: str(item.link),
    modifiedBy: str(item.modifiedBy),
    modifiedAt: str(item.modifiedAt)
  }
  if (kind === 'sentiero') {
    return { ...base, durata: str(item.durata), dislivello: str(item.dislivello), difficolta: str(item.difficolta), lat: toCoord(item.lat), lng: toCoord(item.lng) }
  }
  if (kind === 'spiaggia') {
    return { ...base, accesso: str(item.accesso), servizi: str(item.servizi), lat: toCoord(item.lat), lng: toCoord(item.lng) }
  }
  if (kind === 'pasto') {
    return { ...base, luogo: str(item.luogo), prenotato: item.prenotato === true, lat: toCoord(item.lat), lng: toCoord(item.lng) }
  }
  return base
}

function normalizeDay(raw) {
  const day = raw && typeof raw === 'object' ? raw : {}
  return {
    id: makeId(),
    date: str(day.date),
    title: str(day.title),
    note: str(day.note),
    modifiedBy: str(day.modifiedBy),
    modifiedAt: str(day.modifiedAt),
    items: arr(day.items).map(normalizeDayItem)
  }
}

function normalizeCardItem(raw) {
  const item = raw && typeof raw === 'object' ? raw : {}
  return {
    id: makeId(),
    title: str(item.title),
    meta: str(item.meta),
    detail: str(item.detail),
    link: str(item.link),
    tags: arr(item.tags).map(str),
    lat: toCoord(item.lat),
    lng: toCoord(item.lng),
    modifiedBy: str(item.modifiedBy),
    modifiedAt: str(item.modifiedAt)
  }
}

function normalizeChecklistItem(raw) {
  const item = raw && typeof raw === 'object' ? raw : {}
  return {
    id: makeId(),
    text: str(item.text),
    done: item.done === true,
    modifiedBy: str(item.modifiedBy),
    modifiedAt: str(item.modifiedAt)
  }
}

function normalizeTransportItem(raw) {
  const item = raw && typeof raw === 'object' ? raw : {}
  return {
    id: makeId(),
    mode: str(item.mode),
    from: str(item.from),
    to: str(item.to),
    date: str(item.date),
    time: str(item.time),
    ticketLink: str(item.ticketLink),
    note: str(item.note),
    modifiedBy: str(item.modifiedBy),
    modifiedAt: str(item.modifiedAt)
  }
}

function normalizeLodgingItem(raw) {
  const item = raw && typeof raw === 'object' ? raw : {}
  return {
    id: makeId(),
    name: str(item.name),
    checkIn: str(item.checkIn),
    checkOut: str(item.checkOut),
    address: str(item.address),
    bookingLink: str(item.bookingLink),
    note: str(item.note),
    modifiedBy: str(item.modifiedBy),
    modifiedAt: str(item.modifiedAt)
  }
}

function normalizeMapItem(raw) {
  const item = raw && typeof raw === 'object' ? raw : {}
  const lat = toCoord(item.lat)
  const lng = toCoord(item.lng)
  return {
    id: makeId(),
    name: str(item.name),
    category: str(item.category),
    mapsLink: str(item.mapsLink),
    lat,
    lng,
    note: str(item.note),
    modifiedBy: str(item.modifiedBy),
    modifiedAt: str(item.modifiedAt)
  }
}

function normalizeSection(raw) {
  const section = raw && typeof raw === 'object' ? raw : {}
  const type = SECTION_TYPES.includes(section.type) ? section.type : 'cards'
  const icon = ICONS.includes(section.icon) ? section.icon : 'note'
  const base = { id: makeId(), title: str(section.title), icon, type }

  if (type === 'checklist') {
    return { ...base, items: arr(section.items).map(normalizeChecklistItem) }
  }
  if (type === 'notes') {
    return { ...base, text: str(section.text), modifiedBy: str(section.modifiedBy), modifiedAt: str(section.modifiedAt) }
  }
  if (type === 'transport') {
    return { ...base, items: arr(section.items).map(normalizeTransportItem) }
  }
  if (type === 'lodging') {
    return { ...base, items: arr(section.items).map(normalizeLodgingItem) }
  }
  if (type === 'map') {
    return { ...base, items: arr(section.items).map(normalizeMapItem) }
  }
  return { ...base, items: arr(section.items).map(normalizeCardItem) }
}

const FIXED_SECTIONS = [
  { title: 'Trasporti', icon: 'bus', type: 'transport' },
  { title: 'Pernottamento', icon: 'bed', type: 'lodging' },
  { title: 'Ristoranti', icon: 'food', type: 'cards' },
  { title: 'Mappa', icon: 'map', type: 'map' }
]

function withFixedSections(sections) {
  const remaining = [...sections]
  const fixed = FIXED_SECTIONS.map((f) => {
    const idx = remaining.findIndex((s) => s.type === f.type && (f.type !== 'cards' || s.title === f.title))
    if (idx === -1) return normalizeSection({ title: f.title, icon: f.icon, type: f.type })
    const [match] = remaining.splice(idx, 1)
    return match
  })
  return [...fixed, ...remaining]
}

// Accetta un oggetto viaggio "sporco" (da import, seed o Supabase), riempie i campi
// mancanti e genera gli id locali. Lancia solo se manca il nome: è l'unico campo
// senza cui il viaggio non ha senso da mostrare.
export function normalizeTrip(raw) {
  const trip = raw && typeof raw === 'object' ? raw : {}
  const name = str(trip.name).trim()
  if (!name) {
    throw new Error('Il viaggio non ha un nome: aggiungi il campo "name" al JSON.')
  }

  return {
    id: makeId(),
    name,
    emoji: str(trip.emoji),
    place: str(trip.place),
    start: str(trip.start),
    end: str(trip.end),
    palette: PALETTES.includes(trip.palette) ? trip.palette : '',
    people: arr(trip.people).map(str),
    days: arr(trip.days).map(normalizeDay),
    sections: withFixedSections(arr(trip.sections).map(normalizeSection))
  }
}

function withoutId({ id, ...rest }) {
  return rest
}

// Inverso di normalizeTrip: ripulisce gli id locali per riottenere lo stesso
// formato usato da import, seed e colonna `data` su Supabase.
export function exportTrip(trip) {
  return {
    name: trip.name,
    emoji: trip.emoji,
    place: trip.place,
    start: trip.start,
    end: trip.end,
    palette: trip.palette,
    people: trip.people,
    days: trip.days.map((day) => ({
      date: day.date,
      title: day.title,
      note: day.note,
      modifiedBy: day.modifiedBy,
      modifiedAt: day.modifiedAt,
      items: day.items.map(withoutId)
    })),
    sections: trip.sections.map((section) => {
      const base = { title: section.title, icon: section.icon, type: section.type }
      if (section.type === 'notes') {
        return { ...base, text: section.text, modifiedBy: section.modifiedBy, modifiedAt: section.modifiedAt }
      }
      return { ...base, items: section.items.map(withoutId) }
    })
  }
}

// Usata dalle viste quando si modifica una voce di un viaggio con sync attiva:
// se non c'è un nome (viaggio non attivo o dispositivo senza preferenza) il
// nodo torna invariato, così l'attribuzione non appare mai per un viaggio
// puramente locale.
export function stampModified(node, displayName) {
  if (!displayName) return node
  return { ...node, modifiedBy: displayName, modifiedAt: new Date().toISOString() }
}

const COORD = String.raw`(-?\d{1,3}\.\d+)`
const MAPS_LINK_PATTERNS = [
  new RegExp(`!3d${COORD}!4d${COORD}`),
  new RegExp(`[?&]q=${COORD},${COORD}`),
  new RegExp(`[?&]ll=${COORD},${COORD}`),
  new RegExp(`@${COORD},${COORD}`)
]

// Legge lat/lng da un link Google/Apple Maps con pattern noti, senza alcuna
// chiamata di rete: i link brevi (maps.app.goo.gl) non contengono coordinate
// leggibili e restano fuori scope, ritornano null come qualunque altro
// formato non riconosciuto — mai un errore.
export function parseCoordsFromMapsLink(url) {
  const text = str(url)
  for (const pattern of MAPS_LINK_PATTERNS) {
    const match = text.match(pattern)
    if (match) {
      const lat = Number(match[1])
      const lng = Number(match[2])
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng }
    }
  }
  return null
}

const DAY_MAP_KINDS = ['sentiero', 'spiaggia', 'pasto']

// Punti con coordinate che vivono in altre sezioni/giorni del viaggio, utili
// per la mappa aggregata. Calcolo derivato, nessuna copia salvata: chiamare
// di nuovo dopo ogni modifica del viaggio, mai persistere il risultato.
export function collectExternalMapPoints(trip) {
  const fromCards = trip.sections
    .filter((s) => s.type === 'cards')
    .flatMap((s) => s.items
      .filter((i) => i.lat !== null && i.lng !== null)
      .map((i) => ({
        id: i.id,
        name: i.title,
        lat: i.lat,
        lng: i.lng,
        link: i.link,
        categoryGroup: 'schede',
        origin: { tab: s.id, sectionTitle: s.title }
      })))
  const fromDays = trip.days.flatMap((d) => d.items
    .filter((i) => DAY_MAP_KINDS.includes(i.kind) && i.lat !== null && i.lng !== null)
    .map((i) => ({
      id: i.id,
      name: i.title,
      lat: i.lat,
      lng: i.lng,
      link: i.link,
      categoryGroup: i.kind,
      origin: { tab: 'days', dayDate: d.date, itemTitle: i.title }
    })))
  return [...fromCards, ...fromDays]
}
