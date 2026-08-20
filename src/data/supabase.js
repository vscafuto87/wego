import { createClient } from '@supabase/supabase-js'

export function computeIsCloudConfigured(url, anonKey) {
  return Boolean(url && anonKey)
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isCloudConfigured = computeIsCloudConfigured(SUPABASE_URL, SUPABASE_ANON_KEY)
export const supabase = isCloudConfigured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null

export async function sendMagicLink(email) {
  if (!isCloudConfigured) throw new Error('La sincronizzazione non è configurata su questo dispositivo.')
  // Il magic link deve riportare l'utente dov'era: per un invitato è /j/<codice>,
  // altrimenti il redirect di default lo scarica sulla lista dei viaggi.
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.href }
  })
  if (error) throw new Error(error.message)
}

export function subscribeAuth(callback) {
  if (!isCloudConfigured) return () => {}
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session))
  return () => data.subscription.unsubscribe()
}

export async function getSession() {
  if (!isCloudConfigured) return null
  const { data } = await supabase.auth.getSession()
  return data.session
}

// Login admin (email+password): stessa sessione Supabase del magic link, solo
// un secondo modo di ottenerla. Chi è admin lo dice app_metadata.is_admin,
// impostato a mano dalla dashboard Supabase — non modificabile dal client.
export async function signInWithPassword(email, password) {
  if (!isCloudConfigured) throw new Error('La sincronizzazione non è configurata su questo dispositivo.')
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.message)
}

export async function signOut() {
  if (!isCloudConfigured) return
  await supabase.auth.signOut()
}
