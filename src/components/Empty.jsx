import { Compass } from 'lucide-react'

// Le schermate vuote sono un invito, non un avviso.
export default function Empty({ icon: Icon = Compass, title, detail, action, className = '' }) {
  return (
    <div className={`flex flex-col items-center text-center gap-2 py-12 px-6 ${className}`}>
      <Icon size={28} className="text-[var(--muted)]" strokeWidth={1.5} />
      <p className="font-display text-xl">{title}</p>
      {detail && <p className="text-sm text-[var(--muted)] max-w-xs">{detail}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
