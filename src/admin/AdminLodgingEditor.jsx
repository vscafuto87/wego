import { useEffect, useRef, useState } from 'react'
import { Plus, Pencil, Trash2, FileText } from 'lucide-react'
import { stampModified } from '../data/schema.js'
import { uploadLodgingAttachment, removeLodgingAttachment, getAttachmentSignedUrl } from '../data/sync.js'
import { getCachedAttachment, setCachedAttachment, removeCachedAttachment } from '../data/attachments.js'

const inputClass = 'border border-[var(--line)] bg-[var(--paper)] rounded-2xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40'
const EMPTY_FORM = { name: '', checkIn: '', checkOut: '', address: '', bookingLink: '', bookingFilePath: '', bookingFileName: '', note: '' }
const MAX_FILE_BYTES = 20 * 1024 * 1024

// Stesso hook duplicato in Transport.jsx/Lodging.jsx: tre righe, non vale un
// import incrociato tra viste per una funzione così piccola.
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

export default function AdminLodgingEditor({ section, onUpdate, activeDisplayName, remoteId, role }) {
  const [form, setForm] = useState(null)
  const [uploadState, setUploadState] = useState({ status: 'idle', error: '' })
  const [openError, setOpenError] = useState(null)
  const online = useOnlineStatus()
  const formSessionRef = useRef(null)
  const pendingDeletionsRef = useRef([])

  function updateItems(fn) {
    onUpdate((t) => ({ ...t, sections: t.sections.map((s) => (s.id === section.id ? { ...s, items: fn(s.items) } : s)) }))
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
      removeLodgingAttachment(path).catch(() => {})
      removeCachedAttachment(path).catch(() => {})
    }
    pendingDeletionsRef.current = []
    closeForm()
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
    const session = formSessionRef.current
    try {
      const path = await uploadLodgingAttachment(remoteId, file)
      await setCachedAttachment(path, file)
      if (formSessionRef.current !== session) {
        removeLodgingAttachment(path).catch(() => {})
        removeCachedAttachment(path).catch(() => {})
        return
      }
      if (previousPath) {
        pendingDeletionsRef.current.push(previousPath)
      }
      setForm((f) => (f ? { ...f, bookingFilePath: path, bookingFileName: file.name } : f))
      setUploadState({ status: 'idle', error: '' })
    } catch (err) {
      if (formSessionRef.current !== session) return
      setUploadState({ status: 'idle', error: `Il caricamento non è riuscito. Controlla la rete e riprova.\n\n${err.message}` })
    }
  }

  function removeAttachmentFromForm() {
    const path = form.bookingFilePath
    if (path) {
      pendingDeletionsRef.current.push(path)
    }
    setForm((f) => (f ? { ...f, bookingFilePath: '', bookingFileName: '' } : f))
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
          : `Questo PDF non è ancora scaricato su questo computer: serve la connessione la prima volta.\n\n${err.message}`,
      })
    }
  }

  const sorted = [...section.items].sort((a, b) => (a.checkIn || '').localeCompare(b.checkIn || ''))

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
      <div className="flex flex-col gap-3">
        {sorted.length === 0 && <p className="text-base text-[var(--muted)]">Nessun alloggio ancora.</p>}
        {sorted.map((item) => (
          <div key={item.id} className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-5">
            <div className="flex items-start justify-between gap-2">
              <p className="font-display font-semibold text-xl">{item.name || 'Senza nome'}</p>
              <div className="flex gap-1">
                <button onClick={() => openForm({ ...item })} aria-label="Modifica alloggio" className="p-2 text-[var(--muted)]">
                  <Pencil size={15} />
                </button>
                <button onClick={() => removeItem(item)} aria-label="Elimina alloggio" className="p-2 text-[var(--muted)]">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
            {(item.checkIn || item.checkOut) && <p className="font-mono text-sm text-[var(--muted)] mt-1">{item.checkIn || '?'} → {item.checkOut || '?'}</p>}
            {item.address && <p className="text-base mt-2">{item.address}</p>}
            {item.bookingFilePath && (
              <>
                <button
                  type="button"
                  onClick={() => handleOpenAttachment(item.id, item.bookingFilePath)}
                  className="flex items-center gap-1.5 text-base text-[var(--accent)] underline mt-2"
                >
                  <FileText size={15} /> Apri il PDF della prenotazione
                </button>
                {openError?.itemId === item.id && (
                  <p className="text-sm text-[var(--accent)] mt-1">{openError.message}</p>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 bg-[var(--card)] border border-[var(--line)] rounded-2xl p-5 sticky top-6">
        {!form && (
          <button onClick={() => openForm(EMPTY_FORM)} className="self-start inline-flex items-center gap-1.5 rounded-full font-sans font-medium text-base h-11 px-5 text-[var(--paper)] bg-[var(--accent)]">
            <Plus size={16} /> Nuovo alloggio
          </button>
        )}
        {form && (
          <form onSubmit={saveItem} className="flex flex-col gap-3">
            <h2 className="font-display font-semibold text-xl">{form.id ? 'Modifica alloggio' : 'Nuovo alloggio'}</h2>
            <input required placeholder="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
            <div className="flex gap-2">
              <input type="date" value={form.checkIn} onChange={(e) => setForm({ ...form, checkIn: e.target.value })} className={`flex-1 min-w-0 ${inputClass}`} />
              <input type="date" value={form.checkOut} onChange={(e) => setForm({ ...form, checkOut: e.target.value })} className={`flex-1 min-w-0 ${inputClass}`} />
            </div>
            <input placeholder="Indirizzo" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={inputClass} />
            <input placeholder="Link prenotazione" value={form.bookingLink} onChange={(e) => setForm({ ...form, bookingLink: e.target.value })} className={inputClass} />

            {!remoteId && (
              <p className="text-sm text-[var(--muted)]">L'allegato sarà disponibile appena il viaggio si sincronizza.</p>
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
                  <button type="button" onClick={removeAttachmentFromForm} className="self-start inline-flex items-center justify-center rounded-full font-sans font-medium text-base h-11 px-5 bg-[var(--tint)]">Rimuovi PDF</button>
                )}
              </div>
            )}

            <textarea placeholder="Nota" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={inputClass} rows={2} />
            <div className="flex gap-2">
              <button type="submit" className="inline-flex items-center justify-center rounded-full font-sans font-medium text-base h-11 px-5 text-[var(--paper)] bg-[var(--accent)]">Salva</button>
              <button type="button" onClick={closeForm} className="inline-flex items-center justify-center rounded-full font-sans font-medium text-base h-11 px-5 bg-[var(--tint)]">Annulla</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
