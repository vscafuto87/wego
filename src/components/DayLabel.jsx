export default function DayLabel({ children }) {
  return (
    <div className="inline-block">
      <span className="font-mono text-[13px] font-semibold uppercase tracking-widest text-[var(--accent)]">
        {children}
      </span>
      <span className="block w-7 h-[3px] rounded-full bg-[var(--accent)] mt-1.5" />
    </div>
  )
}
