import { useEffect, useRef, useState } from 'react'
import { ChevronDown, LogOut, MonitorDown, Package, UserRound } from 'lucide-react'
import {
  IconBack,
  IconBell,
  IconMore,
  IconRefresh,
} from '../icons/Icons'
import { assetUrl } from '../../lib/assets.js'
import { isStandalone, promptInstall, subscribeInstall } from '../../pwa/install.js'
import { useNavigate } from '../../router'
import './layout.css'

function initialsOf(value) {
  return (
    String(value || '')
      .trim()
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'WK'
  )
}

function ProfileMenu({ teacher, onLogout }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [canInstall, setCanInstall] = useState(false)
  const ref = useRef(null)

  useEffect(() => subscribeInstall((prompt) => setCanInstall(Boolean(prompt) && !isStandalone())), [])

  useEffect(() => {
    if (!open) return undefined
    const onDoc = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false)
    }
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const go = (to) => {
    setOpen(false)
    navigate(to)
  }

  return (
    <div className="profile-menu" ref={ref}>
      <button
        type="button"
        className="profile-menu__trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
      >
        <span className="avatar" aria-hidden>{initialsOf(teacher?.full_name || teacher?.user_id)}</span>
        <ChevronDown size={16} className={`profile-menu__chev ${open ? 'is-open' : ''}`} aria-hidden />
      </button>
      {open && (
        <div className="profile-menu__panel" role="menu">
          <div className="profile-menu__head">
            <span className="avatar" aria-hidden>{initialsOf(teacher?.full_name || teacher?.user_id)}</span>
            <div className="profile-menu__who">
              <p className="profile-menu__name">{teacher?.full_name || 'Signed in'}</p>
              <p className="profile-menu__id">{teacher?.user_id}</p>
              <span className="profile-menu__role">Teacher</span>
            </div>
          </div>
          <button type="button" role="menuitem" className="profile-menu__item" onClick={() => go('/profile')}>
            <UserRound size={16} aria-hidden /> My profile
          </button>
          <button type="button" role="menuitem" className="profile-menu__item" onClick={() => go('/inventory')}>
            <Package size={16} aria-hidden /> Kit inventory
          </button>
          {canInstall && (
            <button
              type="button"
              role="menuitem"
              className="profile-menu__item"
              onClick={() => {
                setOpen(false)
                promptInstall()
              }}
            >
              <MonitorDown size={16} aria-hidden /> Install app
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className="profile-menu__item profile-menu__item--danger"
            onClick={() => {
              setOpen(false)
              onLogout()
            }}
          >
            <LogOut size={16} aria-hidden /> Log out
          </button>
        </div>
      )}
    </div>
  )
}

export default function TopBar({
  variant,
  showRefresh = false,
  showMore = false,
  showBell = false,
  onBack,
  teacher,
  onLogout,
}) {
  const handleBack = () => {
    if (onBack) onBack()
    else window.history.back()
  }
  // The API often returns the login ID as full_name (e.g. a username like "teacher01") — only greet by a real name.
  const fullName = String(teacher?.full_name || '').trim()
  const looksLikeLoginId = !fullName || fullName === teacher?.user_id || /[\d._@]/.test(fullName)
  const firstName = looksLikeLoginId ? '' : fullName.split(/\s+/)[0]

  return (
    <header className="topbar">
      <div className="topbar__left">
        {variant === 'back' && (
          <button type="button" className="topbar__icon-btn topbar__back" onClick={handleBack} aria-label="Go back">
            <IconBack />
          </button>
        )}
        <img src={assetUrl('assets/logo.png')} alt="WizKlub Futurz" className="topbar__logo" />
        <p className="topbar__greeting">
          Hi{firstName ? `, ${firstName}` : ''} <span aria-hidden>👋</span>
        </p>
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
        <ProfileMenu teacher={teacher} onLogout={onLogout} />
      </div>
    </header>
  )
}
