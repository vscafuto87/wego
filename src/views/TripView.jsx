import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { themeStyle } from '../theme/themes.js'
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
          <button onClick={onBack} aria-label="Torna ai viaggi" className="min-h-11 min-w-11 -ml-2 flex items-center justify-center rounded-full bg-[var(--tint)] active:scale-[0.97] transition-transform duration-150 ease-out">
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl">{trip.emoji}</span>
            <h1 className="font-display text-3xl">{trip.name}</h1>
          </div>
          {trip.place && <p className="text-sm text-[var(--muted)] mt-1">{trip.place}</p>}
        </div>
      </header>

      <nav className="sticky top-0 z-10 bg-[var(--paper)] overflow-x-auto">
        <div className="flex gap-2 px-5 py-3 max-w-2xl mx-auto">
          {tabs.map((tab) => {
            const active = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={active ? { background: 'linear-gradient(135deg, var(--accent), var(--accent2))' } : undefined}
                className={`flex-shrink-0 rounded-full px-4 py-2 font-display text-base whitespace-nowrap transition-transform duration-150 ease-out active:scale-[0.97] ${
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

      <main className="px-5 max-w-2xl mx-auto pb-16">
        {activeTab === 'overview' && <Overview trip={trip} onUpdate={onUpdate} onDelete={onDelete} />}
        {activeTab === 'days' && <Days trip={trip} onUpdate={onUpdate} />}
        {trip.sections.map((section) => (activeTab === section.id ? <Section key={section.id} trip={trip} section={section} onUpdate={onUpdate} /> : null))}
      </main>
    </div>
  )
}
