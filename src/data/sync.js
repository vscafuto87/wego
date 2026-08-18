export function decideSyncAction({ dirty, lastSyncedAt, remoteUpdatedAt }) {
  const remoteIsNewer = Boolean(remoteUpdatedAt) && (!lastSyncedAt || remoteUpdatedAt > lastSyncedAt)
  if (!dirty) {
    return remoteIsNewer ? 'pull' : 'noop'
  }
  return remoteIsNewer ? 'conflict' : 'push'
}

const SHARE_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateShareCode() {
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += SHARE_CODE_CHARS[Math.floor(Math.random() * SHARE_CODE_CHARS.length)]
  }
  return code
}
