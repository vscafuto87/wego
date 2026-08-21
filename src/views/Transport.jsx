import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Pencil, Trash2, Train, Plane, Ship, Car, Bus, GripVertical, FileText } from 'lucide-react'
import Btn from '../components/Btn.jsx'
import Modal from '../components/Modal.jsx'
import Empty from '../components/Empty.jsx'
import { stampModified } from '../data/schema.js'
import ModifiedBy from '../components/ModifiedBy.jsx'
import { uploadTransportAttachment, removeTransportAttachment, getAttachmentSignedUrl } from '../data/sync.js'
import { getCachedAttachment, setCachedAttachment, removeCachedAttachment } from '../data/attachments.js'
import { DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, sortableKeyboardCoordinates, arrayMove, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const inputClass = 'border border-[var(--line)] bg-[var(--card)] rounded-2xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40'
const EMPTY_ITEM = { mode: 'auto', from: '', to: '', date: '', time: '', ticketLink: '', ticketFilePath: '', ticketFileName: '', note: '' }
const MAX_FILE_BYTES = 20 * 1024 * 1024

export const TRANSPORT_MODES = [
  { value: 'auto', label: 'Auto', Icon: Car },
  { value: 'treno', label: 'Treno', Icon: Train },
  { value: 'aereo', label: 'Aereo', Icon: Plane },
  { value: 'bus', label: 'Bus', Icon: Bus },
  { value: 'traghetto', label: 'Traghetto', Icon: Ship }
]

function ModeIcon({ mode }) {
  const Icon = TRANSPORT_MODES.find((m) => m.value === mode)?.Icon ?? Bus
  return <Icon size={19} className="text-[var(--muted)]" />
}

// Stesso hook duplicato in Lodging.jsx e MapSection.jsx: tre righe, non vale
// un import incrociato tra viste.
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

// `newWindow` deve già esistere (aperto in modo sincrono nel gestore del
// click) altrimenti Safari/iOS blocca la nuova scheda: window.open() dopo un
// await non è più nella finestra di esecuzione sincrona dell'evento utente.
async function openAttachment(path, newWindow) {
  let blob = await getCachedAttachment(path)
  if (!blob) {
    const signedUrl = await getAttachmentSignedUrl(path)
    const response = await fetch(signedUrl)
    if (!response.ok) throw new Error(`Il download è fallito (${response.status}).`)
    blob = await response.blob()
    await setCachedAttachment(path, blob)
  }
  const objectUrl = URL.createObjectURL(blob)
  newWindow.location.href = objectUrl
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60000)
}

// Trasporto trascinabile: la maniglia avvia il drag, il resto della scheda si
// comporta come oggi (tap su matita/cestino invariato).
function SortableTransportItem({ item, onEdit, onRemove, onOpenAttachment, openError }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    boxShadow: isDragging ? '0 12px 32px -10px rgb(var(--ink-rgb) / 0.4)' : undefined
  }
  return (
    <div ref={setNodeRef} style={style} className="rounded-[24px] p-5 bg-[var(--card)] shadow-[0_1px_2px_rgb(var(--ink-rgb)/0.05),0_10px_24px_-14px_rgb(var(--ink-rgb)/0.25)]">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <ModeIcon mode={item.mode} />
          <p className="font-display font-semibold text-xl">{item.from} → {item.to}</p>
        </div>
        <div className="flex gap-1 -mr-2 -mt-1">
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label="Trascina per riordinare"
            className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)] cursor-grab touch-none"
          >
            <GripVertical size={15} />
          </button>
          <button onClick={onEdit} aria-label="Modifica trasporto" className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)]">
            <Pencil size={15} />
          </button>
          <button onClick={onRemove} aria-label="Elimina trasporto" className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)]">
            <Trash2 size={15} />
          </button>
        </div>
      </div>
      {(item.date || item.time) && (
        <p className="font-mono text-sm text-[var(--muted)] mt-1">{[item.date, item.time].filter(Boolean).join(' · ')}</p>
      )}
      {item.note && <p className="text-base mt-2">{item.note}</p>}
      {item.ticketLink && (
        <a href={item.ticketLink} target="_blank" rel="noreferrer" className="text-base text-[var(--accent)] underline mt-2 inline-block">
          Apri il biglietto
        </a>
      )}
      {item.ticketFilePath && (
        <>
          <button
            type="button"
            onClick={() => onOpenAttachment(item.id, item.ticketFilePath)}
            className="flex items-center gap-1.5 text-base text-[var(--accent)] underline mt-2"
          >
            <FileText size={15} /> Apri il PDF del biglietto
          </button>
          {openError?.itemId === item.id && (
            <p className="text-sm text-[var(--accent)] mt-1">{openError.message}</p>
          )}
        </>
      )}
      <ModifiedBy modifiedBy={item.modifiedBy} modifiedAt={item.modifiedAt} />
    </div>
  )
}

const Transport = forwardRef(function Transport({ trip, section, onUpdate, activeDisplayName, remoteId, role }, ref) {
  const [form, setForm] = useState(null)
  const [uploadState, setUploadState] = useState({ status: 'idle', error: '' })
  // { itemId, message } | null — legato alla card che ha avviato l'apertura,
  // così è visibile lì invece che solo dentro il modale di modifica.
  const [openError, setOpenError] = useState(null)
  const online = useOnlineStatus()
  // Token per ogni apertura del form: se un upload asincrono risolve dopo che
  // il modale è stato chiuso o riaperto per un altro elemento, lo riconosciamo.
  const formSessionRef = useRef(null)
  // Percorsi Storage/cache "da eliminare" raccolti durante l'editing
  // (sostituzione di un PDF o "Rimuovi PDF"): l'eliminazione vera scatta solo
  // al salvataggio, così un modale chiuso senza salvare non tocca nulla.
  const pendingDeletionsRef = useRef([])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  useImperativeHandle(ref, () => ({ openAdd: () => openForm(EMPTY_ITEM) }))

  function updateItems(fn) {
    onUpdate((t) => ({ ...t, sections: t.sections.map((s) => (s.id === section.id ? { ...s, items: fn(s.items) } : s)) }))
  }

  function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    updateItems((items) => {
      const oldIndex = items.findIndex((it) => it.id === active.id)
      const newIndex = items.findIndex((it) => it.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return items
      return arrayMove(items, oldIndex, newIndex)
    })
  }

  function openForm(item) {
    formSessionRef.current = crypto.randomUUID()
    pendingDeletionsRef.current = []
    setUploadState({ status: 'idle', error: '' })
    setForm(item)
  }

  function closeForm() {
    formSessionRef.current = null
    pendingDeletionsRef.current = []
    setForm(null)
    setUploadState({ status: 'idle', error: '' })
  }

  function saveItem(e) {
    e.preventDefault()
    const { id, ...fields } = form
    updateItems((items) => {
      if (id) return items.map((it) => (it.id === id ? stampModified({ ...it, ...fields }, activeDisplayName) : it))
      return [...items, stampModified({ id: crypto.randomUUID(), ...fields }, activeDisplayName)]
    })
    for (const path of pendingDeletionsRef.current) {
      removeTransportAttachment(path).catch(() => {})
      removeCachedAttachment(path).catch(() => {})
    }
    pendingDeletionsRef.current = []
    closeForm()
  }

  function removeItem(item) {
    if (window.confirm(`Eliminare "${item.mode} ${item.from} → ${item.to}"? Non si può annullare.`)) {
      if (item.ticketFilePath) {
        removeTransportAttachment(item.ticketFilePath).catch(() => {})
        removeCachedAttachment(item.ticketFilePath).catch(() => {})
      }
      updateItems((items) => items.filter((it) => it.id !== item.id))
    }
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    if (!isPdf || file.size > MAX_FILE_BYTES) {
      setUploadState({ status: 'idle', error: 'Puoi allegare solo un file PDF, fino a 20 MB.' })
      return
    }

    setUploadState({ status: 'uploading', error: '' })
    const previousPath = form.ticketFilePath
    const session = formSessionRef.current
    try {
      const path = await uploadTransportAttachment(remoteId, file)
      await setCachedAttachment(path, file)
      if (formSessionRef.current !== session) {
        removeTransportAttachment(path).catch(() => {})
        removeCachedAttachment(path).catch(() => {})
        return
      }
      if (previousPath) {
        pendingDeletionsRef.current.push(previousPath)
      }
      setForm((f) => (f ? { ...f, ticketFilePath: path, ticketFileName: file.name } : f))
      setUploadState({ status: 'idle', error: '' })
    } catch (err) {
      if (formSessionRef.current !== session) return
      setUploadState({ status: 'idle', error: `Il caricamento non è riuscito. Controlla la rete e riprova.\n\n${err.message}` })
    }
  }

  function removeAttachmentFromForm() {
    const path = form.ticketFilePath
    if (path) {
      pendingDeletionsRef.current.push(path)
    }
    setForm((f) => (f ? { ...f, ticketFilePath: '', ticketFileName: '' } : f))
  }

  async function handleOpenAttachment(itemId, path) {
    setOpenError((e) => (e?.itemId === itemId ? null : e))
    const newWindow = window.open('', '_blank')
    if (!newWindow) {
      setOpenError({ itemId, message: 'Non riesco ad aprire il PDF: il browser ha bloccato la nuova scheda.' })
      return
    }
    try {
      await openAttachment(path, newWindow)
    } catch (err) {
      newWindow.close()
      setOpenError({
        itemId,
        message: online
          ? `Non riesco ad aprire il PDF. Controlla la rete e riprova.\n\n${err.message}`
          : `Questo PDF non è ancora scaricato su questo telefono: serve la connessione la prima volta.\n\n${err.message}`,
      })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {section.items.length === 0 && (
        <Empty icon={Bus} title="Nessun trasporto ancora" detail="Aggiungi treni, voli, aliscafi o altri spostamenti." action={<Btn onClick={() => openForm(EMPTY_ITEM)}>Aggiungi un trasporto</Btn>} />
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={section.items.map((it) => it.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-3">
            {section.items.map((item) => (
              <SortableTransportItem
                key={item.id}
                item={item}
                onEdit={() => openForm({ ...item })}
                onRemove={() => removeItem(item)}
                onOpenAttachment={handleOpenAttachment}
                openError={openError}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <Modal open={!!form} title={form?.id ? 'Modifica trasporto' : 'Nuovo trasporto'} onClose={closeForm}>
        {form && (
          <form onSubmit={saveItem} className="flex flex-col gap-3">
            <select required value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })} className={inputClass}>
              {!TRANSPORT_MODES.some((m) => m.value === form.mode) && form.mode && (
                <option value={form.mode}>{form.mode}</option>
              )}
              {TRANSPORT_MODES.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <input required placeholder="Da" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} className={inputClass} />
            <input required placeholder="A" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} className={inputClass} />
            <div className="flex gap-2">
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={`flex-1 ${inputClass}`} />
              <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} className={`flex-1 ${inputClass}`} />
            </div>
            <input placeholder="Link biglietto" value={form.ticketLink} onChange={(e) => setForm({ ...form, ticketLink: e.target.value })} className={inputClass} />

            {!remoteId && (
              <p className="text-sm text-[var(--muted)]">L'allegato sarà disponibile appena il viaggio si sincronizza.</p>
            )}

            {remoteId && role === 'viewer' && form.ticketFileName && (
              <p className="text-sm text-[var(--muted)]">Allegato: {form.ticketFileName}</p>
            )}

            {remoteId && role === 'editor' && (
              <div className="flex flex-col gap-2">
                <label className="text-sm text-[var(--muted)]">
                  {form.ticketFileName ? `Allegato: ${form.ticketFileName}` : 'Nessun PDF allegato'}
                </label>
                <input
                  type="file"
                  accept="application/pdf"
                  disabled={!online || uploadState.status === 'uploading'}
                  onChange={handleFileChange}
                  className={inputClass}
                />
                {!online && <p className="text-sm text-[var(--muted)]">Serve la connessione per allegare un documento.</p>}
                {uploadState.status === 'uploading' && <p className="text-sm text-[var(--muted)]">Caricamento…</p>}
                {uploadState.error && <p className="text-sm text-[var(--accent)]">{uploadState.error}</p>}
                {form.ticketFilePath && (
                  <Btn type="button" variant="secondary" onClick={removeAttachmentFromForm} className="self-start">Rimuovi PDF</Btn>
                )}
              </div>
            )}

            <textarea placeholder="Nota" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={inputClass} rows={2} />
            <Btn type="submit">Salva</Btn>
          </form>
        )}
      </Modal>
    </div>
  )
})

export default Transport
