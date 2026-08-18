import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { exportTrip } from '../data/schema.js'
import Btn from '../components/Btn.jsx'

export default function ExportPanel({ trip }) {
  const [copied, setCopied] = useState(false)
  const json = JSON.stringify(exportTrip(trip), null, 2)

  async function copy() {
    await navigator.clipboard.writeText(json)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex flex-col gap-3">
      <Btn variant="secondary" onClick={copy} className="self-start">
        {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copiato' : 'Copia il JSON'}
      </Btn>
      <pre className="border border-[var(--line)] rounded-md p-3 text-xs font-mono overflow-auto max-h-[50vh] whitespace-pre-wrap">
        {json}
      </pre>
    </div>
  )
}
