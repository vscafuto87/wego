import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { themeStyle, ACCENT_GRADIENT } from '../theme/themes.js'
import Terrain from '../theme/Terrain.jsx'
import Overview from './Overview.jsx'
import Days from './Days.jsx'
import Section from './Section.jsx'

export default function TripView({ trip, onBack, onUpdate, onDelete }) {
  const tabs = [
    { key: 'overview', label: 'Panoramica' },
    { key: 'days', label: 'Giorni' },
    ...trip.sections.map((s) => ({ key: s.id, label: s.title || 'Sezione' }))
  ]
  const [activeTab, setActiveTab] = useState('overview')

  return (
    <div style={themeStyle(trip.palette)} className="min-h-screen bg-[var(--paper)] text-[var(--ink)] font-sans">
      <header className="relative overflow-hidden">
        <Terrain seed={trip.id} palette={trip.palette} height={140} className="absolute inset-0 h-full w-full" />
        <div className="relative px-5 pt-8 pb-6 max-w-2xl mx-auto">
          <button onClick={onBack} aria-label="Torna ai viaggi" className="h-12 w-12 -ml-2 flex items-center justify-center rounded-full bg-[var(--tint)] active:scale-[0.97] transition-transform duration-150 ease-out">
            <ArrowLeft size={21} />
          </button>
          <div className="flex items-baseline gap-2 mt-3">
            <span className="text-4xl">{trip.emoji}</span>
            <h1 className="font-display font-semibold text-4xl">{trip.name}</h1>
          </div>
          {trip.place && <p className="text-base text-[var(--muted)] mt-1">{trip.place}</p>}
        </div>
      </header>

      <main className="px-5 max-w-2xl mx-auto pb-36">
        {activeTab === 'overview' && <Overview trip={trip} onUpdate={onUpdate} onDelete={onDelete} />}
        {activeTab === 'days' && <Days trip={trip} onUpdate={onUpdate} />}
        {trip.sections.map((section) => (activeTab === section.id ? <Section key={section.id} trip={trip} section={section} onUpdate={onUpdate} /> : null))}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 px-5 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-2">
        <div className="max-w-2xl mx-auto flex items-center gap-1 overflow-x-auto bg-[rgb(var(--card-rgb)/0.9)] backdrop-blur-lg rounded-full p-1.5 shadow-[0_2px_4px_rgb(var(--ink-rgb)/0.08),0_20px_40px_-18px_rgb(var(--ink-rgb)/0.3)]">
          {tabs.map((tab) => {
            const active = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={active ? { background: ACCENT_GRADIENT } : undefined}
                className={`flex-shrink-0 h-12 rounded-full px-5 font-sans text-base font-medium whitespace-nowrap transition-transform duration-150 ease-out active:scale-[0.97] ${
                  active
                    ? 'text-[var(--paper)] shadow-[0_10px_20px_-10px_rgb(var(--accent-rgb)/0.55)]'
                    : 'text-[var(--muted)]'
                }`}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
