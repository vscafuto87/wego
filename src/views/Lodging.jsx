import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Bed, FileText } from 'lucide-react'
import Btn from '../components/Btn.jsx'
import Modal from '../components/Modal.jsx'
import Empty from '../components/Empty.jsx'
import { stampModified } from '../data/schema.js'
import ModifiedBy from '../components/ModifiedBy.jsx'
import CoordsInput from '../components/CoordsInput.jsx'
import { uploadLodgingAttachment, removeLodgingAttachment, getAttachmentSignedUrl } from '../data/sync.js'
import { getCachedAttachment, setCachedAttachment, removeCachedAttachment } from '../data/attachments.js'

const inputClass = 'border border-[var(--line)] bg-[var(--card)] rounded-2xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40'
const EMPTY_ITEM = { name: '', checkIn: '', checkOut: '', address: '', bookingLink: '', lat: null, lng: null, bookingFilePath: '', bookingFileName: '', note: '' }
const MAX_FILE_BYTES = 20 * 1024 * 1024

// Stesso hook, non condiviso, già usato in MapSection.jsx: duplicare tre
// righe è più semplice che introdurre un import incrociato tra viste per
// una funzione così piccola (stesso criterio già scelto per formatDate
// nella spec della mappa aggregata).
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

async function openAttachment(path) {
  let blob = await getCachedAttachment(path)
  if (!blob) {
    const signedUrl = await getAttachmentSignedUrl(path)
    const response = await fetch(signedUrl)
    blob = await response.blob()
    await setCachedAttachment(path, blob)
  }
  const objectUrl = URL.createObjectURL(blob)
  window.open(objectUrl, '_blank')
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60000)
}

export default function Lodging({ trip, section, onUpdate, activeDisplayName, remoteId, role, onOpenActivate }) {
  const [form, setForm] = useState(null)
  const [uploadState, setUploadState] = useState({ status: 'idle', error: '' })
  const [openError, setOpenError] = useState('')
  const online = useOnlineStatus()

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
      if (item.bookingFilePath) {
        removeLodgingAttachment(item.bookingFilePath).catch(() => {})
        removeCachedAttachment(item.bookingFilePath).catch(() => {})
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
    const previousPath = form.bookingFilePath
    try {
      const path = await uploadLodgingAttachment(remoteId, file)
      await setCachedAttachment(path, file)
      if (previousPath) {
        removeLodgingAttachment(previousPath).catch(() => {})
        removeCachedAttachment(previousPath).catch(() => {})
      }
      setForm((f) => ({ ...f, bookingFilePath: path, bookingFileName: file.name }))
      setUploadState({ status: 'idle', error: '' })
    } catch (err) {
      setUploadState({ status: 'idle', error: 'Il caricamento non è riuscito. Controlla la rete e riprova.' })
    }
  }

  function removeAttachmentFromForm() {
    const path = form.bookingFilePath
    if (path) {
      removeLodgingAttachment(path).catch(() => {})
      removeCachedAttachment(path).catch(() => {})
    }
    setForm((f) => ({ ...f, bookingFilePath: '', bookingFileName: '' }))
  }

  async function handleOpenAttachment(path) {
    setOpenError('')
    try {
      await openAttachment(path)
    } catch {
      setOpenError(online
        ? 'Non riesco ad aprire il PDF. Controlla la rete e riprova.'
        : 'Questo PDF non è ancora scaricato su questo telefono: serve la connessione la prima volta.')
    }
  }

  const sorted = [...section.items].sort((a, b) => (a.checkIn || '').localeCompare(b.checkIn || ''))

  return (
    <div className="flex flex-col gap-4">
      {sorted.length === 0 && (
        <Empty icon={Bed} title="Nessun alloggio ancora" detail="Aggiungi hotel o appartamenti prenotati." action={<Btn onClick={() => setForm(EMPTY_ITEM)}>Aggiungi un alloggio</Btn>} />
      )}

      <div className="flex flex-col gap-3">
        {sorted.map((item) => (
          <div key={item.id} className="rounded-[24px] p-5 bg-[var(--card)] shadow-[0_1px_2px_rgb(var(--ink-rgb)/0.05),0_10px_24px_-14px_rgb(var(--ink-rgb)/0.25)]">
            <div className="flex items-start justify-between gap-2">
              <p className="font-display font-semibold text-xl">{item.name || 'Senza nome'}</p>
              <div className="flex gap-1 -mr-2 -mt-1">
                <button onClick={() => setForm({ ...item })} aria-label="Modifica alloggio" className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)]">
                  <Pencil size={15} />
                </button>
                <button onClick={() => removeItem(item)} aria-label="Elimina alloggio" className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)]">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
            {(item.checkIn || item.checkOut) && (
              <p className="font-mono text-sm text-[var(--muted)] mt-1">{item.checkIn || '?'} → {item.checkOut || '?'}</p>
            )}
            {item.address && <p className="text-base mt-2">{item.address}</p>}
            {item.note && <p className="text-sm text-[var(--muted)] mt-1">{item.note}</p>}
            {item.bookingLink && (
              <a href={item.bookingLink} target="_blank" rel="noreferrer" className="text-base text-[var(--accent)] underline mt-2 inline-block">
                Apri la prenotazione
              </a>
            )}
            {item.bookingFilePath && (
              <button
                type="button"
                onClick={() => handleOpenAttachment(item.bookingFilePath)}
                className="flex items-center gap-1.5 text-base text-[var(--accent)] underline mt-2"
              >
                <FileText size={15} /> Apri il PDF della prenotazione
              </button>
            )}
            <ModifiedBy modifiedBy={item.modifiedBy} modifiedAt={item.modifiedAt} />
          </div>
        ))}
      </div>

      {sorted.length > 0 && (
        <Btn variant="secondary" onClick={() => setForm(EMPTY_ITEM)} className="self-start">
          <Plus size={17} /> Nuovo alloggio
        </Btn>
      )}

      <Modal open={!!form} title={form?.id ? 'Modifica alloggio' : 'Nuovo alloggio'} onClose={() => setForm(null)}>
        {form && (
          <form onSubmit={saveItem} className="flex flex-col gap-3">
            <input required placeholder="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
            <div className="flex gap-2">
              <input type="date" placeholder="Check-in" value={form.checkIn} onChange={(e) => setForm({ ...form, checkIn: e.target.value })} className={`flex-1 ${inputClass}`} />
              <input type="date" placeholder="Check-out" value={form.checkOut} onChange={(e) => setForm({ ...form, checkOut: e.target.value })} className={`flex-1 ${inputClass}`} />
            </div>
            <input placeholder="Indirizzo" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={inputClass} />
            <CoordsInput
              value={{ lat: form.lat, lng: form.lng }}
              onChange={(coords) => setForm({ ...form, ...coords })}
              onAddressFound={(address) => setForm((f) => (f.address ? f : { ...f, address }))}
            />
            <input placeholder="Link prenotazione" value={form.bookingLink} onChange={(e) => setForm({ ...form, bookingLink: e.target.value })} className={inputClass} />

            {!remoteId && (
              <div className="flex flex-col gap-2 rounded-2xl border border-[var(--line)] p-4">
                <p className="text-sm text-[var(--muted)]">Attiva la sincronizzazione per allegare documenti.</p>
                <Btn type="button" variant="secondary" onClick={onOpenActivate} className="self-start">Attiva la sincronizzazione</Btn>
              </div>
            )}

            {remoteId && role === 'viewer' && form.bookingFileName && (
              <p className="text-sm text-[var(--muted)]">Allegato: {form.bookingFileName}</p>
            )}

            {remoteId && role === 'editor' && (
              <div className="flex flex-col gap-2">
                <label className="text-sm text-[var(--muted)]">
                  {form.bookingFileName ? `Allegato: ${form.bookingFileName}` : 'Nessun PDF allegato'}
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
                {form.bookingFilePath && (
                  <Btn type="button" variant="secondary" onClick={removeAttachmentFromForm} className="self-start">Rimuovi PDF</Btn>
                )}
              </div>
            )}

            {openError && <p className="text-sm text-[var(--accent)]">{openError}</p>}

            <textarea placeholder="Nota" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={inputClass} rows={2} />
            <Btn type="submit">Salva</Btn>
          </form>
        )}
      </Modal>
    </div>
  )
}
