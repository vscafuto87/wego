export default function Label({ children, className = '' }) {
  return (
    <span className={`font-mono text-xs uppercase tracking-wider text-[var(--muted)] ${className}`}>
      {children}
    </span>
  )
}
