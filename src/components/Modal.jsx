import { useEffect } from 'react'
import { X } from 'lucide-react'

export default function Modal({ open, title, onClose, children, footer }) {
  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-[28px] sm:rounded-[28px] bg-[var(--card)] text-[var(--ink)] p-5 shadow-[0_1px_2px_rgb(var(--ink-rgb)/0.06),0_24px_48px_-16px_rgb(var(--ink-rgb)/0.35)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Chiudi"
            className="min-h-11 min-w-11 flex items-center justify-center -mr-2 -mt-2 rounded-full bg-[var(--tint)] active:scale-[0.97] transition-transform duration-150 ease-out"
          >
            <X size={20} />
          </button>
        </div>
        {children}
        {footer && <div className="mt-5 flex gap-2 justify-end">{footer}</div>}
      </div>
    </div>
  )
}
