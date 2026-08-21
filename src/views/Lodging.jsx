import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Bed, FileText, MapPin } from 'lucide-react'
import EditIcon from '../components/EditIcon.jsx'
import DeleteIcon from '../components/DeleteIcon.jsx'
import Btn from '../components/Btn.jsx'
import Modal from '../components/Modal.jsx'
import Empty from '../components/Empty.jsx'
import { stampModified } from '../data/schema.js'
import ModifiedBy from '../components/ModifiedBy.jsx'
import CoordsInput from '../components/CoordsInput.jsx'
import { ACCENT_GRADIENT } from '../theme/themes.js'
import { uploadLodgingAttachment, removeLodgingAttachment, getAttachmentSignedUrl } from '../data/sync.js'
import { getCachedAttachment, setCachedAttachment, removeCachedAttachment } from '../data/attachments.js'

const inputClass = 'border border-[var(--line)] bg-[var(--card)] rounded-2xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40'
const chipClass = 'inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-[var(--tint)] text-[var(--accent)] text-sm font-medium'
const EMPTY_ITEM = { name: '', checkIn: '', checkOut: '', address: '', bookingLink: '', lat: null, lng: null, bookingFilePath: '', bookingFileName: '', note: '' }
const MAX_FILE_BYTES = 20 * 1024 * 1024

function nightsBetween(checkIn, checkOut) {
  if (!checkIn || !checkOut) return null
  const n = Math.round((new Date(checkOut) - new Date(checkIn)) / 86400000)
  return n > 0 ? n : null
}

// Confronto lessicografico su stringhe AAAA-MM-GG: funziona perché lo stesso
// formato ordina già cronologicamente, senza passare da Date/timezone.
function isCurrentStay(checkIn, checkOut) {
  if (!checkIn || !checkOut) return false
  const today = new Date().toISOString().slice(0, 10)
  return today >= checkIn && today < checkOut
}

// Preferisce le coordinate (più precise, sempre apribili in Maps); usa
// l'indirizzo come ricerca solo se lat/lng non sono stati impostati.
function mapsUrl(item) {
  if (typeof item.lat === 'number' && typeof item.lng === 'number') {
    return `https://www.google.com/maps?q=${item.lat},${item.lng}`
  }
  if (item.address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.address)}`
  }
  return null
}

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

// `newWindow` deve già esistere (aperto in modo sincrono nel gestore del
// click, prima di qualunque await) altrimenti Safari/iOS blocca la nuova
// scheda: window.open() chiamato dopo un await non è più nella finestra di
// esecuzione sincrona dell'evento utente.
async function openAttachment(path, newWindow) {
  let blob = await getCachedAttachment(path)
  if (!blob) {
    const signedUrl = await getAttachmentSignedUrl(path)
    const response = await fetch(signedUrl)
    // Un fetch che "va a buon fine" a livello di trasporto (proxy con SSL
    // inspection, captive portal, 5xx di Storage) può comunque restituire un
    // corpo HTML/di errore al posto del PDF: senza questo controllo finirebbe
    // in cache e verrebbe servito per sempre come se fosse l'allegato vero.
    if (!response.ok) throw new Error(`Il download è fallito (${response.status}).`)
    blob = await response.blob()
    await setCachedAttachment(path, blob)
  }
  const objectUrl = URL.createObjectURL(blob)
  newWindow.location.href = objectUrl
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60000)
}

const Lodging = forwardRef(function Lodging({ trip, section, onUpdate, activeDisplayName, remoteId, role }, ref) {
  const [form, setForm] = useState(null)
  const [uploadState, setUploadState] = useState({ status: 'idle', error: '' })
  // { itemId, message } | null — itemId lega il messaggio alla card che ha
  // avviato l'apertura, così è visibile lì (finding 1) invece che solo dentro
  // il modale di modifica.
  const [openError, setOpenError] = useState(null)
  const online = useOnlineStatus()
  // Identifica la "sessione" di modifica corrente (un token per ogni apertura
  // del form). Serve a riconoscere, quando un upload asincrono risolve, se il
  // modale è stato nel frattempo chiuso o riaperto per un altro elemento
  // (finding 4): in quel caso l'update va scartato e l'upload ripulito.
  const formSessionRef = useRef(null)
  // Percorsi Storage/cache "da eliminare" raccolti durante l'editing (sostituzione
  // di un PDF o "Rimuovi PDF"): l'eliminazione vera scatta solo quando saveItem
  // commette la modifica. Se il modale si chiude senza salvare, la lista viene
  // scartata senza toccare nulla, così l'item conserva il suo bookingFilePath
  // originale e l'oggetto dietro resta valido (revisione finale, finding 2).
  const pendingDeletionsRef = useRef([])

  useImperativeHandle(ref, () => ({ openAdd: () => openForm(EMPTY_ITEM) }))

  function updateItems(fn) {
    onUpdate((t) => ({ ...t, sections: t.sections.map((s) => (s.id === section.id ? { ...s, items: fn(s.items) } : s)) }))
  }

  // Apre il form per un nuovo elemento o per la modifica di uno esistente,
  // azzerando sempre lo stato di upload/apertura della sessione precedente
  // (finding 3).
  function openForm(item) {
    formSessionRef.current = crypto.randomUUID()
    pendingDeletionsRef.current = []
    setUploadState({ status: 'idle', error: '' })
    // openError non si azzera qui: è per-card (itemId), aprire il form di un
    // elemento non deve cancellare un messaggio ancora valido su un altro
    // elemento (bonus). handleOpenAttachment lo pulisce già, scoped, quando
    // parte un nuovo tentativo per lo stesso item.
    setForm(item)
  }

  function closeForm() {
    formSessionRef.current = null
    // Modale chiuso senza salvare: scartiamo le eliminazioni in sospeso senza
    // eseguirle (revisione finale, finding 2).
    pendingDeletionsRef.current = []
    setForm(null)
    setUploadState({ status: 'idle', error: '' })
    // Idem: non toccare openError qui, vedi openForm.
  }

  function saveItem(e) {
    e.preventDefault()
    const { id, ...fields } = form
    updateItems((items) => {
      if (id) return items.map((it) => (it.id === id ? stampModified({ ...it, ...fields }, activeDisplayName) : it))
      return [...items, stampModified({ id: crypto.randomUUID(), ...fields }, activeDisplayName)]
    })
    // Il salvataggio è andato a buon fine: ora gli oggetti sostituiti o
    // rimossi durante l'editing non servono più a nessun item, si possono
    // eliminare davvero (revisione finale, finding 2).
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
    // Tocca formSessionRef, non form: se il modale viene chiuso o riaperto
    // per un altro elemento mentre l'upload è in volo, il token cambia e lo
    // riconosciamo al resolve (finding 4).
    const session = formSessionRef.current
    try {
      const path = await uploadLodgingAttachment(remoteId, file)
      await setCachedAttachment(path, file)
      if (formSessionRef.current !== session) {
        // Sessione del form terminata nel frattempo: il form è null (o è
        // un altro elemento) e non c'è più nessuno a cui agganciare questo
        // allegato. Non tocchiamo `form` (eviterebbe di farlo "riapparire"
        // con dati incompleti) e ripuliamo l'upload appena fatto per non
        // lasciarlo orfano su Storage/cache.
        removeLodgingAttachment(path).catch(() => {})
        removeCachedAttachment(path).catch(() => {})
        return
      }
      if (previousPath) {
        // Non eliminiamo subito: l'item salvato punta ancora a previousPath
        // finché saveItem non commette il nuovo path. Se il modale si chiude
        // senza salvare, questa eliminazione va scartata (revisione finale, finding 2).
        pendingDeletionsRef.current.push(previousPath)
      }
      // Update funzionale con guardia: se `f` è null (modale chiuso proprio
      // tra il controllo sopra e questa riga) non lo si resuscita.
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
      // Come per la sostituzione: l'eliminazione vera è rimandata a saveItem
      // (revisione finale, finding 2).
      pendingDeletionsRef.current.push(path)
    }
    setForm((f) => (f ? { ...f, bookingFilePath: '', bookingFileName: '' } : f))
  }

  async function handleOpenAttachment(itemId, path) {
    // Pulisce solo l'errore di *questo* item: un tentativo per l'item A non
    // deve far sparire un messaggio ancora valido sotto la card dell'item B
    // (bonus).
    setOpenError((e) => (e?.itemId === itemId ? null : e))
    // Apertura sincrona della scheda, prima di qualunque await: soddisfa il
    // requisito dei popup-blocker di Safari/iOS (finding 2). Se il browser
    // la blocca comunque, window.open('', '_blank') torna null qui, in modo
    // sincrono e rilevabile — a differenza di window.open(objectUrl, ...)
    // dopo un await, che tornerebbe null senza mai lanciare un errore.
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

  const sorted = [...section.items].sort((a, b) => (a.checkIn || '').localeCompare(b.checkIn || ''))

  return (
    <div className="flex flex-col gap-4">
      {sorted.length === 0 && (
        <Empty icon={Bed} title="Nessun alloggio ancora" detail="Aggiungi hotel o appartamenti prenotati." action={<Btn onClick={() => openForm(EMPTY_ITEM)}>Aggiungi un alloggio</Btn>} />
      )}

      <div className="flex flex-col gap-3">
        {sorted.map((item) => {
          const nights = nightsBetween(item.checkIn, item.checkOut)
          const current = isCurrentStay(item.checkIn, item.checkOut)
          const maps = mapsUrl(item)
          return (
            <div key={item.id} className="rounded-[24px] p-5 bg-[var(--card)] shadow-[0_1px_2px_rgb(var(--ink-rgb)/0.05),0_10px_24px_-14px_rgb(var(--ink-rgb)/0.25)]">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-display font-semibold text-xs uppercase tracking-wider text-[var(--accent)]">Alloggio</p>
                  <p className="font-display font-semibold text-xl mt-0.5">{item.name || 'Senza nome'}</p>
                  {(item.checkIn || item.checkOut) && (
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="font-mono text-sm text-[var(--muted)]">{item.checkIn || '?'} → {item.checkOut || '?'}</span>
                      {nights != null && (
                        <span className="font-mono text-xs bg-[var(--tint)] rounded-full px-2 py-0.5">{nights} nott{nights === 1 ? 'e' : 'i'}</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 -mr-2 -mt-1 flex-none">
                  {current && (
                    <span className="font-mono text-xs font-semibold tracking-wide text-[var(--paper)] rounded-full px-2.5 py-1 mr-1" style={{ background: ACCENT_GRADIENT }}>
                      IN CORSO
                    </span>
                  )}
                  <button onClick={() => openForm({ ...item })} aria-label="Modifica alloggio" className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)]">
                    <EditIcon size={15} />
                  </button>
                  <button onClick={() => removeItem(item)} aria-label="Elimina alloggio" className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)]">
                    <DeleteIcon size={15} />
                  </button>
                </div>
              </div>

              {item.address && <p className="text-base mt-3">{item.address}</p>}

              {(maps || item.bookingFilePath) && (
                <>
                  <div className="h-px bg-[var(--line)] mt-3 mb-3" />
                  <div className="flex gap-2 flex-wrap">
                    {maps && (
                      <a href={maps} target="_blank" rel="noreferrer" className={chipClass}>
                        <MapPin size={15} /> Apri in Maps
                      </a>
                    )}
                    {item.bookingFilePath && (
                      <button type="button" onClick={() => handleOpenAttachment(item.id, item.bookingFilePath)} className={chipClass}>
                        <FileText size={15} /> PDF prenotazione
                      </button>
                    )}
                  </div>
                  {openError?.itemId === item.id && (
                    <p className="text-sm text-[var(--accent)] mt-1">{openError.message}</p>
                  )}
                </>
              )}

              <ModifiedBy modifiedBy={item.modifiedBy} modifiedAt={item.modifiedAt} />
            </div>
          )
        })}
      </div>

      <Modal open={!!form} title={form?.id ? 'Modifica alloggio' : 'Nuovo alloggio'} onClose={closeForm}>
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
              <p className="text-sm text-[var(--muted)]">L'allegato sarà disponibile appena il viaggio si sincronizza.</p>
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

            <textarea placeholder="Nota" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={inputClass} rows={2} />
            <Btn type="submit">Salva</Btn>
          </form>
        )}
      </Modal>
    </div>
  )
})

export default Lodging
