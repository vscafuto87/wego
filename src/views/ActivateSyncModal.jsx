import { useEffect, useState } from 'react'
import Modal from '../components/Modal.jsx'
import Btn from '../components/Btn.jsx'
import MagicLinkForm from '../components/MagicLinkForm.jsx'
import DisplayNameForm from '../components/DisplayNameForm.jsx'
import { subscribeAuth, getSession } from '../data/supabase.js'
import { activateTripSync } from '../data/sync.js'
import { getDisplayNamePreference, setDisplayNamePreference } from '../data/storage.js'

export default function ActivateSyncModal({ open, trip, onClose, onActivated }) {
  const [step, setStep] = useState('email')
  const [namePreference, setNamePreference] = useState('')
  const [shareLink, setShareLink] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    getDisplayNamePreference().then(setNamePreference)
    getSession().then((session) => { if (session) setStep((s) => (s === 'email' ? 'name' : s)) })
    const unsubscribe = subscribeAuth((session) => { if (session) setStep((s) => (s === 'email' ? 'name' : s)) })
    return unsubscribe
  }, [open])

  async function handleName(name) {
    setError('')
    await setDisplayNamePreference(name)
    try {
      const state = await activateTripSync(trip, name)
      setShareLink(`${window.location.origin}/j/${state.shareCode}`)
      setStep('done')
      onActivated(state)
    } catch (e) {
      setError(e.message)
      setStep('name')
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(shareLink)
  }

  function handleClose() {
    setStep('email')
    setError('')
    onClose()
  }

  return (
    <Modal open={open} title="Attiva la sincronizzazione" onClose={handleClose}>
      {step === 'email' && <MagicLinkForm />}
      {step === 'name' && (
        <>
          {error && <p className="text-sm text-[var(--accent)] mb-2">{error}</p>}
          <DisplayNameForm initialValue={namePreference} onSubmit={handleName} />
        </>
      )}
      {step === 'done' && (
        <div className="flex flex-col gap-3">
          <p className="text-sm">Il viaggio è ora sincronizzato. Condividi questo link con chi viene con te:</p>
          <p className="font-mono text-sm break-all bg-[var(--tint)] rounded-md p-3">{shareLink}</p>
          <Btn onClick={copyLink}>Copia link</Btn>
        </div>
      )}
    </Modal>
  )
}
