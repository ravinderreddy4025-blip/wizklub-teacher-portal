const tokenSessions = new Map()

export function storeSession(accessToken, session) {
  tokenSessions.set(accessToken, {
    ...session,
    createdAt: Date.now(),
  })
}

export function getSession(accessToken) {
  return tokenSessions.get(accessToken) ?? null
}

export function deleteSession(accessToken) {
  tokenSessions.delete(accessToken)
}

export function replaceSession(oldAccessToken, newAccessToken, updates) {
  const existing = tokenSessions.get(oldAccessToken)
  if (!existing) return false

  tokenSessions.delete(oldAccessToken)
  tokenSessions.set(newAccessToken, {
    ...existing,
    ...updates,
    createdAt: Date.now(),
  })
  return true
}
