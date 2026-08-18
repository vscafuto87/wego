import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { themeStyle } from '../theme/themes.js'
import Terrain from '../theme/Terrain.jsx'
import Stripe from '../components/Stripe.jsx'
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
          <button onClick={onBack} aria-label="Torna ai viaggi" className="min-h-11 min-w-11 -ml-2 flex items-center">
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl">{trip.emoji}</span>
            <h1 className="font-display text-3xl">{trip.name}</h1>
          </div>
          {trip.place && <p className="text-sm text-[var(--muted)] mt-1">{trip.place}</p>}
        </div>
      </header>

      <nav className="sticky top-0 z-10 bg-[var(--paper)] border-b border-[var(--line)] overflow-x-auto">
        <div className="flex px-5 max-w-2xl mx-auto">
          {tabs.map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} className="flex-shrink-0 px-3 py-3 font-display text-base whitespace-nowrap">
              {tab.label}
              <Stripe className={activeTab === tab.key ? 'opacity-100' : 'opacity-0'} />
            </button>
          ))}
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
