import { useEffect, useState } from 'react'
import './PwaInstallBanner.css'

export default function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem('pwa_install_dismissed') === '1',
  )
  const [isStandalone, setIsStandalone] = useState(false)

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    setIsStandalone(standalone)

    const onBeforeInstall = (event) => {
      event.preventDefault()
      setDeferredPrompt(event)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  }, [])

  if (isStandalone || dismissed || !deferredPrompt) return null

  const handleInstall = async () => {
    deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDeferredPrompt(null)
    setDismissed(true)
    localStorage.setItem('pwa_install_dismissed', '1')
  }

  const handleDismiss = () => {
    setDismissed(true)
    localStorage.setItem('pwa_install_dismissed', '1')
  }

  return (
    <div className="pwa-install" role="region" aria-label="Install app">
      <div className="pwa-install__content">
        <p className="pwa-install__title">Install Wizklub Teacher Upload</p>
        <p className="pwa-install__text">Add to your home screen for quick access and full-screen use.</p>
      </div>
      <div className="pwa-install__actions">
        <button type="button" className="pwa-install__btn pwa-install__btn--ghost" onClick={handleDismiss}>
          Not now
        </button>
        <button type="button" className="pwa-install__btn pwa-install__btn--primary" onClick={handleInstall}>
          Install
        </button>
      </div>
    </div>
  )
}
