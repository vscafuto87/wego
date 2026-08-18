import { Compass } from 'lucide-react'

// Le schermate vuote sono un invito, non un avviso.
export default function Empty({ icon: Icon = Compass, title, detail, action, className = '' }) {
  return (
    <div className={`flex flex-col items-center text-center gap-3 py-12 px-6 ${className}`}>
      <div className="flex items-center justify-center h-16 w-16 rounded-full bg-[var(--tint)]">
        <Icon size={26} className="text-[var(--muted)]" strokeWidth={1.5} />
      </div>
      <p className="font-display font-semibold text-2xl">{title}</p>
      {detail && <p className="text-base text-[var(--muted)] max-w-xs">{detail}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
