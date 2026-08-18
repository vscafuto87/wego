const VARIANTS = {
  primary: 'bg-[var(--accent)] text-[var(--paper)]',
  secondary: 'bg-transparent border border-[var(--line)] text-[var(--ink)]',
  ghost: 'bg-transparent text-[var(--ink)]',
  danger: 'bg-transparent text-[var(--accent)]'
}

export default function Btn({ variant = 'primary', className = '', children, ...props }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-md font-sans font-medium text-sm active:opacity-70 disabled:opacity-40 disabled:pointer-events-none ${VARIANTS[variant] ?? VARIANTS.primary} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
