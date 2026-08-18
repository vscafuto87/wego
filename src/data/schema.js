const PALETTES = ['mountain', 'sea', 'city', 'wild']
const ICONS = ['map', 'check', 'note', 'ticket', 'food', 'bed', 'bus', 'star', 'people']
const SECTION_TYPES = ['cards', 'checklist', 'notes']

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
  return {
    id: makeId(),
    time: str(item.time),
    title: str(item.title),
    detail: str(item.detail),
    link: str(item.link)
  }
}

function normalizeDay(raw) {
  const day = raw && typeof raw === 'object' ? raw : {}
  return {
    id: makeId(),
    date: str(day.date),
    title: str(day.title),
    note: str(day.note),
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
    tags: arr(item.tags).map(str)
  }
}

function normalizeChecklistItem(raw) {
  const item = raw && typeof raw === 'object' ? raw : {}
  return {
    id: makeId(),
    text: str(item.text),
    done: item.done === true
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
    return { ...base, text: str(section.text) }
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
      items: day.items.map(withoutId)
    })),
    sections: trip.sections.map((section) => {
      const base = { title: section.title, icon: section.icon, type: section.type }
      if (section.type === 'notes') {
        return { ...base, text: section.text }
      }
      return { ...base, items: section.items.map(withoutId) }
    })
  }
}
