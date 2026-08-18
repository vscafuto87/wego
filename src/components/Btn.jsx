const VARIANTS = {
  primary:
    'text-[var(--paper)] shadow-[0_10px_24px_-8px_rgb(var(--accent-rgb)/0.45)] min-h-12 px-5',
  secondary: 'bg-[var(--tint)] text-[var(--ink)] shadow-[0_1px_2px_rgb(var(--ink-rgb)/0.05)] min-h-12 px-5',
  ghost: 'bg-transparent text-[var(--ink)] min-h-11 px-4',
  danger: 'bg-transparent text-[var(--accent)] min-h-11 px-4'
}

const PRIMARY_STYLE = { background: 'linear-gradient(135deg, var(--accent), var(--accent2))' }

export default function Btn({ variant = 'primary', className = '', style, children, ...props }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-full font-sans font-medium text-sm transition-transform duration-150 ease-out active:scale-[0.97] active:opacity-70 disabled:opacity-40 disabled:pointer-events-none ${VARIANTS[variant] ?? VARIANTS.primary} ${className}`}
      style={variant === 'primary' ? { ...PRIMARY_STYLE, ...style } : style}
      {...props}
    >
      {children}
    </button>
  )
}
