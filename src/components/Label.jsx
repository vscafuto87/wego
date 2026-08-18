export default function Label({ children, className = '' }) {
  return (
    <span className={`font-mono text-[11px] uppercase tracking-wider text-[var(--muted)] ${className}`}>
      {children}
    </span>
  )
}
