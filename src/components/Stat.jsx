import Label from './Label.jsx'

export default function Stat({ label, value, className = '' }) {
  return (
    <div className={`flex flex-col gap-0.5 ${className}`}>
      <span className="font-mono text-xl leading-none text-[var(--ink)]">{value}</span>
      <Label>{label}</Label>
    </div>
  )
}
