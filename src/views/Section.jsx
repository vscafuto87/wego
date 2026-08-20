import { lazy, Suspense, useState } from 'react'
import { Plus, Pencil, Trash2, Check } from 'lucide-react'
import Btn from '../components/Btn.jsx'
import Label from '../components/Label.jsx'
import Modal from '../components/Modal.jsx'
import Empty from '../components/Empty.jsx'
import { stampModified } from '../data/schema.js'
import ModifiedBy from '../components/ModifiedBy.jsx'
import CoordsInput from '../components/CoordsInput.jsx'
import Transport from './Transport.jsx'
import Lodging from './Lodging.jsx'

const MapSection = lazy(() => import('./MapSection.jsx'))

function isFixedSection(section) {
  if (section.type === 'transport' || section.type === 'lodging' || section.type === 'map') return true
  return section.type === 'cards' && section.title === 'Ristoranti'
}

const inputClass = 'border border-[var(--line)] bg-[var(--card)] rounded-2xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40'

function updateSection(trip, sectionId, fn) {
  return { ...trip, sections: trip.sections.map((s) => (s.id === sectionId ? fn(s) : s)) }
}

export default function Section({ trip, section, onUpdate, activeDisplayName, onNavigate, syncState }) {
  const [headerForm, setHeaderForm] = useState(null)
  const [cardForm, setCardForm] = useState(null)
  const [checklistText, setChecklistText] = useState('')
  const [notesDraft, setNotesDraft] = useState(section.text ?? '')

  function saveHeader(e) {
    e.preventDefault()
    onUpdate((t) => updateSection(t, section.id, (s) => ({ ...s, title: headerForm.title })))
    setHeaderForm(null)
  }

  function saveCard(e) {
    e.preventDefault()
    const tags = cardForm.tags.split(',').map((x) => x.trim()).filter(Boolean)
    onUpdate((t) =>
      updateSection(t, section.id, (s) => {
        if (cardForm.id) {
          return { ...s, items: s.items.map((it) => (it.id === cardForm.id ? stampModified({ ...it, ...cardForm, tags }, activeDisplayName) : it)) }
        }
        return { ...s, items: [...s.items, stampModified({ id: crypto.randomUUID(), ...cardForm, tags }, activeDisplayName)] }
      })
    )
    setCardForm(null)
  }

  function removeCard(item) {
    if (window.confirm(`Eliminare "${item.title}"? Non si può annullare.`)) {
      onUpdate((t) => updateSection(t, section.id, (s) => ({ ...s, items: s.items.filter((it) => it.id !== item.id) })))
    }
  }

  function addChecklistItem(e) {
    e.preventDefault()
    if (!checklistText.trim()) return
    onUpdate((t) =>
      updateSection(t, section.id, (s) => ({
        ...s,
        items: [...s.items, { id: crypto.randomUUID(), text: checklistText.trim(), done: false }]
      }))
    )
    setChecklistText('')
  }

  function toggleChecklistItem(item) {
    onUpdate((t) => updateSection(t, section.id, (s) => ({ ...s, items: s.items.map((it) => (it.id === item.id ? stampModified({ ...it, done: !it.done }, activeDisplayName) : it)) })))
  }

  function removeChecklistItem(item) {
    onUpdate((t) => updateSection(t, section.id, (s) => ({ ...s, items: s.items.filter((it) => it.id !== item.id) })))
  }

  function saveNotes() {
    onUpdate((t) => updateSection(t, section.id, (s) => stampModified({ ...s, text: notesDraft }, activeDisplayName)))
  }

  return (
    <div className="flex flex-col gap-4 pt-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-semibold text-3xl">{section.title}</h2>
        {!isFixedSection(section) && (
          <button onClick={() => setHeaderForm({ title: section.title })} aria-label="Rinomina sezione" className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)]">
            <Pencil size={17} />
          </button>
        )}
      </div>

      {section.type === 'cards' && (
        <>
          {section.items.length === 0 && <Empty title="Nessuna scheda ancora" detail="Aggiungine una per iniziare." />}
          <div className="flex flex-col gap-3">
            {section.items.map((item) => (
              <div key={item.id} className="rounded-[24px] p-5 bg-[var(--card)] shadow-[0_1px_2px_rgb(var(--ink-rgb)/0.05),0_10px_24px_-14px_rgb(var(--ink-rgb)/0.25)]">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-display font-semibold text-xl">{item.title || 'Senza titolo'}</p>
                  <div className="flex gap-1 -mr-2 -mt-1">
                    <button
                      onClick={() => setCardForm({ id: item.id, title: item.title, meta: item.meta, detail: item.detail, link: item.link, tags: item.tags.join(', '), lat: item.lat, lng: item.lng })}
                      aria-label="Modifica scheda"
                      className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)]"
                    >
                      <Pencil size={15} />
                    </button>
                    <button onClick={() => removeCard(item)} aria-label="Elimina scheda" className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)]">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                {item.meta && <p className="font-mono text-sm text-[var(--muted)] mt-1">{item.meta}</p>}
                {item.detail && <p className="text-base mt-2">{item.detail}</p>}
                {item.link && (
                  <a href={item.link} target="_blank" rel="noreferrer" className="text-base text-[var(--accent)] underline mt-2 inline-block">
                    Apri il link
                  </a>
                )}
                {item.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {item.tags.map((tag) => (
                      <Label key={tag} className="bg-[var(--tint)] px-2.5 py-1 rounded-full">
                        {tag}
                      </Label>
                    ))}
                  </div>
                )}
                <ModifiedBy modifiedBy={item.modifiedBy} modifiedAt={item.modifiedAt} />
              </div>
            ))}
          </div>
          <Btn variant="secondary" onClick={() => setCardForm({ title: '', meta: '', detail: '', link: '', tags: '', lat: null, lng: null })} className="self-start">
            <Plus size={17} /> Nuova scheda
          </Btn>
        </>
      )}

      {section.type === 'checklist' && (
        <>
          {section.items.length === 0 && <Empty title="Niente da spuntare ancora" detail="Aggiungi la prima voce." />}
          <ul className="flex flex-col divide-y divide-[var(--line)] bg-[var(--card)] rounded-[24px] shadow-[0_1px_2px_rgb(var(--ink-rgb)/0.05)] overflow-hidden">
            {section.items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-4 py-1">
                <button onClick={() => toggleChecklistItem(item)} aria-pressed={item.done} aria-label={item.done ? 'Segna come da fare' : 'Segna come fatto'} className="min-h-12 min-w-12 flex items-center justify-center">
                  <span className={`h-5 w-5 rounded border flex items-center justify-center ${item.done ? 'bg-[var(--accent)] border-[var(--accent)]' : 'border-[var(--line)]'}`}>
                    {item.done && <Check size={14} className="text-[var(--paper)]" />}
                  </span>
                </button>
                <div className="flex-1">
                  <span className={`text-base ${item.done ? 'line-through text-[var(--muted)]' : ''}`}>{item.text}</span>
                  <ModifiedBy modifiedBy={item.modifiedBy} modifiedAt={item.modifiedAt} />
                </div>
                <button onClick={() => removeChecklistItem(item)} aria-label="Elimina voce" className="min-h-12 min-w-12 flex items-center justify-center text-[var(--muted)]">
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
          <form onSubmit={addChecklistItem} className="flex gap-2">
            <input placeholder="Nuova voce" value={checklistText} onChange={(e) => setChecklistText(e.target.value)} className={`flex-1 ${inputClass}`} />
            <Btn type="submit" variant="secondary">
              <Plus size={17} />
            </Btn>
          </form>
        </>
      )}

      {section.type === 'notes' && (
        <>
          <textarea
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            onBlur={saveNotes}
            placeholder="Scrivi qui le tue note."
            rows={10}
            className={`${inputClass} font-sans`}
          />
          <ModifiedBy modifiedBy={section.modifiedBy} modifiedAt={section.modifiedAt} />
        </>
      )}

      {section.type === 'transport' && <Transport trip={trip} section={section} onUpdate={onUpdate} activeDisplayName={activeDisplayName} />}

      {section.type === 'lodging' && (
        <Lodging
          trip={trip}
          section={section}
          onUpdate={onUpdate}
          activeDisplayName={activeDisplayName}
          remoteId={syncState?.remoteId ?? null}
          role={syncState?.role ?? null}
        />
      )}

      {section.type === 'map' && (
        <Suspense fallback={<p className="text-base text-[var(--muted)]">Caricamento mappa…</p>}>
          <MapSection trip={trip} section={section} onUpdate={onUpdate} activeDisplayName={activeDisplayName} onNavigate={onNavigate} />
        </Suspense>
      )}

      <Modal open={!!headerForm} title="Rinomina sezione" onClose={() => setHeaderForm(null)}>
        {headerForm && (
          <form onSubmit={saveHeader} className="flex flex-col gap-3">
            <input required value={headerForm.title} onChange={(e) => setHeaderForm({ title: e.target.value })} className={inputClass} />
            <Btn type="submit">Salva</Btn>
          </form>
        )}
      </Modal>

      <Modal open={!!cardForm} title={cardForm?.id ? 'Modifica scheda' : 'Nuova scheda'} onClose={() => setCardForm(null)}>
        {cardForm && (
          <form onSubmit={saveCard} className="flex flex-col gap-3">
            <input required placeholder="Titolo" value={cardForm.title} onChange={(e) => setCardForm({ ...cardForm, title: e.target.value })} className={inputClass} />
            <input placeholder="Info breve (es. km, orario)" value={cardForm.meta} onChange={(e) => setCardForm({ ...cardForm, meta: e.target.value })} className={inputClass} />
            <textarea placeholder="Dettaglio" value={cardForm.detail} onChange={(e) => setCardForm({ ...cardForm, detail: e.target.value })} className={inputClass} rows={2} />
            <input placeholder="Link" value={cardForm.link} onChange={(e) => setCardForm({ ...cardForm, link: e.target.value })} className={inputClass} />
            <input placeholder="Tag (separati da virgola)" value={cardForm.tags} onChange={(e) => setCardForm({ ...cardForm, tags: e.target.value })} className={inputClass} />
            <CoordsInput value={{ lat: cardForm.lat, lng: cardForm.lng }} onChange={(coords) => setCardForm({ ...cardForm, ...coords })} />
            <Btn type="submit">Salva</Btn>
          </form>
        )}
      </Modal>
    </div>
  )
}
