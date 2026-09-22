import { useEffect, useState } from 'react'
import { Smartphone, X } from 'lucide-react'
import { assetUrl } from '../lib/assets.js'
import {
  isStandalone,
  promptInstall,
  shouldShowInstallCard,
  snoozeInstallCard,
  subscribeInstall,
} from '../pwa/install.js'
import './PwaInstallBanner.css'

/*
 * Phone/tablet only (desktop gets "Install app" in the avatar menu instead).
 * Waits for a returning user, and "Not now" snoozes it for 14 days rather than nagging every load.
 */
export default function PwaInstallBanner() {
  const [canInstall, setCanInstall] = useState(false)
  const [hidden, setHidden] = useState(() => !shouldShowInstallCard())

  useEffect(() => subscribeInstall((prompt) => setCanInstall(Boolean(prompt))), [])

  const isSmallScreen = typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches
  if (hidden || !canInstall || !isSmallScreen || isStandalone()) return null

  const handleDismiss = () => {
    snoozeInstallCard()
    setHidden(true)
  }

  const handleInstall = async () => {
    const accepted = await promptInstall()
    if (!accepted) snoozeInstallCard()
    setHidden(true)
  }

  return (
    <div className="pwa-install" role="region" aria-label="Install the Teachers Portal app">
      <img src={assetUrl('assets/logo.png')} alt="" className="pwa-install__logo" />
      <div className="pwa-install__content">
        <p className="pwa-install__title">Get the app on your phone</p>
        <p className="pwa-install__text">Open uploads in one tap from your home screen, full screen.</p>
      </div>
      <button type="button" className="pwa-install__btn" onClick={handleInstall}>
        <Smartphone size={16} aria-hidden /> Install
      </button>
      <button type="button" className="pwa-install__close" onClick={handleDismiss} aria-label="Not now">
        <X size={18} aria-hidden />
      </button>
    </div>
  )
}
