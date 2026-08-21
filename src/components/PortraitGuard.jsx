import { RotateCw } from 'lucide-react'

// Il manifest ha già orientation:'portrait', ma iOS lo ignora anche da app
// installata e nessun browser lo applica in una scheda non installata:
// questo overlay CSS-only copre quei casi, sempre, ovunque.
export default function PortraitGuard() {
  return (
    <div className="hidden landscape:flex fixed inset-0 z-[1300] bg-[#1C2721] text-[#F0EDE3] flex-col items-center justify-center gap-4 px-8 text-center font-sans">
      <RotateCw size={40} />
      <p className="text-lg">Ruota il telefono in verticale per continuare</p>
    </div>
  )
}
