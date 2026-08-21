import { ICONS } from './Settings.jsx'
import Empty from '../components/Empty.jsx'

function sectionSummary(section) {
  if (section.type === 'checklist') {
    if (section.items.length === 0) return 'Nessuna voce'
    const done = section.items.filter((i) => i.done).length
    return `${done}/${section.items.length} pronte`
  }
  if (section.type === 'notes') return section.text ? 'Nota scritta' : 'Nessuna nota'
  if (section.type === 'transport') return section.items.length === 1 ? '1 trasferimento' : `${section.items.length} trasferimenti`
  if (section.type === 'lodging') return section.items.length === 1 ? '1 alloggio' : `${section.items.length} alloggi`
  return section.items.length === 1 ? '1 scheda' : `${section.items.length} schede`
}

// Griglia delle sezioni del viaggio (Mappa esclusa: ha una sua pillola fissa
// in barra). Sostituisce una pillola per sezione, che altrimenti fa crescere
// senza limite la barra di navigazione in fondo.
export default function SectionsHub({ sections, onOpen }) {
  if (sections.length === 0) {
    return <Empty title="Nessuna sezione ancora" detail="Le sezioni del viaggio compariranno qui." className="pt-5" />
  }

  return (
    <div className="grid grid-cols-2 gap-3 pt-5">
      {sections.map((section) => {
        const Icon = ICONS[section.icon] ?? ICONS.note
        return (
          <button
            key={section.id}
            onClick={() => onOpen(section.id)}
            className="text-left rounded-[24px] p-4 bg-[var(--card)] shadow-[0_1px_2px_rgb(var(--ink-rgb)/0.05),0_10px_24px_-14px_rgb(var(--ink-rgb)/0.25)] active:scale-[0.98] transition-transform duration-150 ease-out"
          >
            <div className="h-10 w-10 rounded-full bg-[var(--tint)] flex items-center justify-center">
              <Icon size={18} className="text-[var(--accent)]" />
            </div>
            <p className="font-display font-semibold text-[17px] mt-2.5 leading-snug">{section.title}</p>
            <p className="font-mono text-xs text-[var(--muted)] mt-0.5">{sectionSummary(section)}</p>
          </button>
        )
      })}
    </div>
  )
}
