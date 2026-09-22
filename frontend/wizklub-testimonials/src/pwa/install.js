/**
 * Shared "Add to home screen" state: captures the browser's install prompt once,
 * so the mobile install card and the avatar-menu "Install app" item use the same event.
 */
const VISITS_KEY = 'pwa_visit_count'
const SNOOZE_KEY = 'pwa_install_snoozed_until'
const SNOOZE_DAYS = 14

let deferredPrompt = null
const listeners = new Set()

function emit() {
  listeners.forEach((fn) => fn(deferredPrompt))
}

function safeGet(key) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSet(key, value) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* storage unavailable — prompt simply shows again next time */
  }
}

export function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
  )
}

export function initInstallPrompt() {
  // Count sessions, not page loads: the card waits for a returning user.
  try {
    if (!window.sessionStorage.getItem('pwa_session_counted')) {
      window.sessionStorage.setItem('pwa_session_counted', '1')
      safeSet(VISITS_KEY, String(Number(safeGet(VISITS_KEY) || 0) + 1))
    }
  } catch {
    /* ignore */
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferredPrompt = event
    emit()
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    emit()
  })
}

export function subscribeInstall(fn) {
  listeners.add(fn)
  fn(deferredPrompt)
  return () => listeners.delete(fn)
}

export async function promptInstall() {
  if (!deferredPrompt) return false
  const event = deferredPrompt
  deferredPrompt = null
  emit()
  event.prompt()
  const choice = await event.userChoice
  return choice?.outcome === 'accepted'
}

/** The card only appears for returning users who haven't snoozed it recently. */
export function shouldShowInstallCard() {
  const visits = Number(safeGet(VISITS_KEY) || 0)
  const snoozedUntil = Number(safeGet(SNOOZE_KEY) || 0)
  return visits >= 2 && Date.now() > snoozedUntil
}

export function snoozeInstallCard() {
  safeSet(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000))
}
