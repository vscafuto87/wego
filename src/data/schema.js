const PALETTES = ['mountain', 'sea', 'city', 'wild']
const ICONS = ['map', 'check', 'note', 'ticket', 'food', 'bed', 'bus', 'star', 'people']
const SECTION_TYPES = ['cards', 'checklist', 'notes', 'transport', 'lodging', 'map']

const DAY_ITEM_KINDS = ['', 'sentiero', 'spiaggia', 'pasto']

const KIND_FIELDS = {
  sentiero: ['durata', 'dislivello', 'difficolta'],
  spiaggia: ['accesso', 'servizi'],
  pasto: ['luogo', 'prenotato']
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
    return { ...base, durata: str(item.durata), dislivello: str(item.dislivello), difficolta: str(item.difficolta) }
  }
  if (kind === 'spiaggia') {
    return { ...base, accesso: str(item.accesso), servizi: str(item.servizi) }
  }
  if (kind === 'pasto') {
    return { ...base, luogo: str(item.luogo), prenotato: item.prenotato === true }
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
  const lat = typeof item.lat === 'number' && Number.isFinite(item.lat) ? item.lat : null
  const lng = typeof item.lng === 'number' && Number.isFinite(item.lng) ? item.lng : null
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
    sections: arr(trip.sections).map(normalizeSection)
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
