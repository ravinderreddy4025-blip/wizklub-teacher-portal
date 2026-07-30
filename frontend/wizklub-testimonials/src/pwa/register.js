import { registerSW } from 'virtual:pwa-register'

let applyUpdate = null

export function initPwa({ onNeedRefresh, onOfflineReady } = {}) {
  applyUpdate = registerSW({
    immediate: true,
    onNeedRefresh() {
      onNeedRefresh?.()
    },
    onOfflineReady() {
      onOfflineReady?.()
    },
  })
}

export function refreshPwa() {
  applyUpdate?.(true)
}
