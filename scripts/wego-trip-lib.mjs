export const SECTION_TYPES = ['cards', 'checklist', 'notes', 'transport', 'lodging', 'map']

const SHARE_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const SHARE_CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/

export function isShareCode(value) {
  return typeof value === 'string' && SHARE_CODE_RE.test(value)
}

export function generateShareCode() {
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += SHARE_CODE_CHARS[Math.floor(Math.random() * SHARE_CODE_CHARS.length)]
  }
  return code
}

export function validateTripPayload(data) {
  if (!data || typeof data !== 'object' || !String(data.name || '').trim()) {
    throw new Error('Il file non ha un campo "name" valido.')
  }
  const sections = Array.isArray(data.sections) ? data.sections : []
  for (const section of sections) {
    if (!SECTION_TYPES.includes(section.type)) {
      throw new Error(`Tipo di sezione non valido: "${section.type}". Tipi ammessi: ${SECTION_TYPES.join(', ')}.`)
    }
  }
}

function deepEqual(a, b) {
  if (a === b) return true
  if (a === null || b === null) return a === b
  if (typeof a !== 'object' || typeof b !== 'object') return a === b
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false
    return a.every((item, i) => deepEqual(item, b[i]))
  }
  const keysA = Object.keys(a).sort()
  const keysB = Object.keys(b).sort()
  if (keysA.length !== keysB.length) return false
  if (!keysA.every((k, i) => k === keysB[i])) return false
  return keysA.every((key) => deepEqual(a[key], b[key]))
}

function itemKey(item) {
  if (item && typeof item === 'object') {
    if (typeof item.title === 'string' && item.title) return item.title
    if (typeof item.name === 'string' && item.name) return item.name
    if (typeof item.text === 'string' && item.text) return item.text
    if (item.mode || item.from || item.to) return `${item.mode || ''} ${item.from || ''}→${item.to || ''}`.trim()
  }
  return JSON.stringify(item)
}

function diffItems(remoteItems, proposedItems) {
  const remoteMap = new Map(remoteItems.map((item) => [itemKey(item), item]))
  const proposedMap = new Map(proposedItems.map((item) => [itemKey(item), item]))
  const added = []
  const changed = []
  for (const [key, item] of proposedMap) {
    if (!remoteMap.has(key)) added.push(key)
    else if (!deepEqual(remoteMap.get(key), item)) changed.push(key)
  }
  const removed = [...remoteMap.keys()].filter((key) => !proposedMap.has(key))
  return { added, removed, changed }
}

function isUnchanged(itemDiff) {
  return !itemDiff.added.length && !itemDiff.removed.length && !itemDiff.changed.length
}

function diffDays(remoteDays, proposedDays) {
  const remoteByDate = new Map(remoteDays.map((day) => [day.date, day]))
  const proposedByDate = new Map(proposedDays.map((day) => [day.date, day]))
  const days = []

  for (const [date, day] of proposedByDate) {
    const remoteDay = remoteByDate.get(date)
    if (!remoteDay) {
      days.push({ date, status: 'nuovo', itemCount: (day.items ?? []).length })
      continue
    }
    const itemDiff = diffItems(remoteDay.items ?? [], day.items ?? [])
    days.push(isUnchanged(itemDiff) ? { date, status: 'invariato' } : { date, status: 'modificato', ...itemDiff })
  }
  for (const date of remoteByDate.keys()) {
    if (!proposedByDate.has(date)) days.push({ date, status: 'rimosso' })
  }
  return days
}

function diffSections(remoteSections, proposedSections) {
  const remoteByTitle = new Map(remoteSections.map((s) => [s.title, s]))
  const proposedByTitle = new Map(proposedSections.map((s) => [s.title, s]))
  const sections = []

  for (const [title, section] of proposedByTitle) {
    const remoteSection = remoteByTitle.get(title)
    if (!remoteSection) {
      sections.push({ title, status: 'nuova', itemCount: section.type === 'notes' ? 0 : (section.items ?? []).length })
      continue
    }
    if (section.type === 'notes') {
      sections.push({ title, status: remoteSection.text === section.text ? 'invariata' : 'testo aggiornato' })
      continue
    }
    const itemDiff = diffItems(remoteSection.items ?? [], section.items ?? [])
    sections.push(isUnchanged(itemDiff) ? { title, status: 'invariata' } : { title, status: 'modificata', ...itemDiff })
  }
  for (const title of remoteByTitle.keys()) {
    if (!proposedByTitle.has(title)) sections.push({ title, status: 'rimossa' })
  }
  return sections
}

const META_SCALAR_FIELDS = ['name', 'emoji', 'place', 'start', 'end', 'palette']

function diffMeta(remoteData, proposedData) {
  const entries = []
  if (remoteData) {
    for (const field of META_SCALAR_FIELDS) {
      const from = remoteData[field] ?? ''
      const to = proposedData[field] ?? ''
      if (from !== to) entries.push({ field, from, to })
    }
    if (!deepEqual(remoteData.people ?? [], proposedData.people ?? [])) {
      entries.push({
        field: 'people',
        from: (remoteData.people ?? []).join(', '),
        to: (proposedData.people ?? []).join(', ')
      })
    }
  } else {
    for (const field of META_SCALAR_FIELDS) {
      if (proposedData[field]) entries.push({ field, to: proposedData[field] })
    }
    if ((proposedData.people ?? []).length) {
      entries.push({ field: 'people', to: proposedData.people.join(', ') })
    }
  }
  return entries
}

export function diffTrip(remoteData, proposedData) {
  return {
    meta: diffMeta(remoteData, proposedData),
    days: diffDays(remoteData?.days ?? [], proposedData?.days ?? []),
    sections: diffSections(remoteData?.sections ?? [], proposedData?.sections ?? [])
  }
}

function describeChange(label, entry) {
  const parts = []
  if (entry.added.length) parts.push(`+${entry.added.length} voce (${entry.added.join(', ')})`)
  if (entry.removed.length) parts.push(`-${entry.removed.length} voce (${entry.removed.join(', ')})`)
  if (entry.changed.length) parts.push(`${entry.changed.length} modificata (${entry.changed.join(', ')})`)
  return `  ${label}: ${parts.join(', ')}`
}

function describeDay(day) {
  if (day.status === 'invariato') return `  ${day.date}: nessuna modifica`
  if (day.status === 'nuovo') return `  ${day.date}: nuovo giorno (${day.itemCount} voci)`
  if (day.status === 'rimosso') return `  ${day.date}: rimosso`
  return describeChange(day.date, day)
}

function describeSection(section) {
  if (section.status === 'invariata') return `  ${section.title}: nessuna modifica`
  if (section.status === 'nuova') return `  ${section.title}: nuova sezione (${section.itemCount} voci)`
  if (section.status === 'rimossa') return `  ${section.title}: rimossa`
  if (section.status === 'testo aggiornato') return `  ${section.title}: testo aggiornato`
  return describeChange(section.title, section)
}

function describeMeta(entry) {
  if (entry.from !== undefined) return `  ${entry.field}: ${entry.from} → ${entry.to}`
  return `  ${entry.field}: ${entry.to}`
}

export function formatDiffSummary({ tripName, shareCode, diff, isCreate }) {
  const header = isCreate ? `Nuovo viaggio: ${tripName}` : `Viaggio: ${tripName} (share_code ${shareCode})`
  const meta = diff.meta ?? []
  return [
    header,
    '',
    ...(meta.length ? ['Dati generali:', ...meta.map(describeMeta), ''] : []),
    'Giorni:',
    ...diff.days.map(describeDay),
    '',
    'Sezioni:',
    ...diff.sections.map(describeSection),
    '',
    'Nessuna scrittura eseguita (dry-run). Rilancia con --yes per confermare.'
  ].join('\n')
}

export const ATTACHMENT_SECTION_TYPES = ['transport', 'lodging']

export function isPdfPath(filePath) {
  return typeof filePath === 'string' && /\.pdf$/i.test(filePath)
}

export function attachmentFields(sectionType) {
  return sectionType === 'transport'
    ? { pathField: 'ticketFilePath', nameField: 'ticketFileName' }
    : { pathField: 'bookingFilePath', nameField: 'bookingFileName' }
}

export function describeSectionItem(sectionType, item) {
  if (sectionType === 'transport') {
    const route = [item.from, item.to].filter(Boolean).join(' → ')
    const base = [item.mode || 'trasporto', route].filter(Boolean).join(' ')
    return item.date ? `${base}, ${item.date}` : base
  }
  const name = item.name || 'alloggio'
  const dates = [item.checkIn, item.checkOut].filter(Boolean).join(' → ')
  return dates ? `${name}, ${dates}` : name
}

function describeItemsListLine(sectionType, item, index) {
  const { nameField } = attachmentFields(sectionType)
  const status = item[nameField] ? `allegato: ${item[nameField]}` : 'nessun allegato'
  return `${index}. ${describeSectionItem(sectionType, item)} (${status})`
}

export function formatItemsList(sectionType, sectionTitle, items) {
  if (!items.length) return `Nessuna voce in ${sectionTitle}.`
  return items.map((item, i) => describeItemsListLine(sectionType, item, i + 1)).join('\n')
}
