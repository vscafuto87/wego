// Barra a tre bande accent/bianco/accent, come un segnavia CAI: usata sotto la tab attiva.
export default function Stripe({ className = '' }) {
  return (
    <span className={`flex h-[3px] w-full overflow-hidden rounded-full ${className}`} aria-hidden="true">
      <span className="flex-1 bg-[var(--accent)]" />
      <span className="flex-1 bg-[var(--paper)]" />
      <span className="flex-1 bg-[var(--accent)]" />
    </span>
  )
}
