import { ACCENT_GRADIENT } from '../theme/themes.js'

const VARIANTS = {
  primary:
    'text-[var(--paper)] shadow-[0_2px_4px_rgb(var(--ink-rgb)/0.08),0_24px_38px_-16px_rgb(var(--accent-rgb)/0.55)] h-[60px] px-7',
  secondary: 'bg-[var(--tint)] text-[var(--ink)] shadow-[0_1px_2px_rgb(var(--ink-rgb)/0.06)] h-[60px] px-7',
  ghost: 'bg-transparent text-[var(--ink)] min-h-12 px-5',
  danger: 'bg-transparent text-[var(--accent)] min-h-12 px-5'
}

const PRIMARY_STYLE = { background: ACCENT_GRADIENT }

export default function Btn({ variant = 'primary', className = '', style, children, ...props }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-full font-sans font-medium text-base transition-transform duration-150 ease-out active:scale-[0.97] active:opacity-70 disabled:opacity-40 disabled:pointer-events-none ${VARIANTS[variant] ?? VARIANTS.primary} ${className}`}
      style={variant === 'primary' ? { ...PRIMARY_STYLE, ...style } : style}
      {...props}
    >
      {children}
    </button>
  )
}
