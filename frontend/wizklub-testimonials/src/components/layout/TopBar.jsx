import {
  IconBack,
  IconBell,
  IconMore,
  IconRefresh,
} from '../icons/Icons'
import { assetUrl } from '../../lib/assets.js'
import './layout.css'

export default function TopBar({
  variant,
  showRefresh = false,
  showMore = false,
  showBell = false,
  onBack,
}) {
  const handleBack = () => {
    if (onBack) onBack()
    else window.history.back()
  }

  return (
    <header className="topbar">
      <div className="topbar__left">
        {variant === 'back' && (
          <button type="button" className="topbar__icon-btn" onClick={handleBack} aria-label="Go back">
            <IconBack />
          </button>
        )}
        <img src={assetUrl('assets/logo.png')} alt="WizKlub Futurz" className="topbar__logo" />
      </div>
      <div className="topbar__right">
        {showRefresh && (
          <button type="button" className="topbar__icon-btn" aria-label="Refresh">
            <IconRefresh />
          </button>
        )}
        {showBell && (
          <button type="button" className="topbar__icon-btn" aria-label="Notifications">
            <IconBell />
          </button>
        )}
        {showMore && (
          <button type="button" className="topbar__icon-btn" aria-label="More options">
            <IconMore />
          </button>
        )}
      </div>
    </header>
  )
}
