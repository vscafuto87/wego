import { get, set, del } from 'idb-keyval'

const PREFIX = 'wego:attachment:'

// Cache locale dei blob PDF già aperti almeno una volta, separata dal
// documento del viaggio (wego:trips): un allegato scaricato non deve
// gonfiare né rallentare il salvataggio del viaggio.
export async function getCachedAttachment(path) {
  return (await get(PREFIX + path)) ?? null
}

export async function setCachedAttachment(path, blob) {
  await set(PREFIX + path, blob)
}

export async function removeCachedAttachment(path) {
  await del(PREFIX + path)
}
