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
  const { error } = await supabase.auth.signInWithOtp({ email })
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
