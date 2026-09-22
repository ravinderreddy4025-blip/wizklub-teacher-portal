import React, { useContext, useEffect, useRef, useState } from 'react';
import { Bell, ChevronDown, LogOut, Menu, RefreshCw } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { getPageTitle } from '../../utils/routes';
import BrandLogo from '../brand/BrandLogo';
import { formatSchoolDisplayName, wizklubSchoolNameToBranch } from '../../utils/schoolName';
import { isEmbeddedInventory } from '../../utils/embed';
import { ROLE_LABEL } from './navLinks';

function initialsOf(value) {
  return (
    String(value || '')
      .trim()
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'U'
  );
}

function useDismiss(open, setOpen) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen]);
  return ref;
}

function ProfileMenu({ user, schoolCodes, onLogout, onSwitchSchool }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, setOpen);
  const initials = initialsOf(user?.name);

  return (
    <div className="inv-profile" ref={ref}>
      <button
        type="button"
        className="inv-profile__trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
      >
        <span className="inv-avatar" aria-hidden>{initials}</span>
        <ChevronDown size={16} className={`inv-profile__chev ${open ? 'is-open' : ''}`} aria-hidden />
      </button>
      {open && (
        <div className="inv-profile__panel" role="menu">
          <div className="inv-profile__head">
            <span className="inv-avatar" aria-hidden>{initials}</span>
            <div className="min-w-0">
              <p className="inv-profile__name" title={user?.name}>{user?.name || 'Signed in'}</p>
              {user?.email && <p className="inv-profile__meta">{user.email}</p>}
              {schoolCodes && <p className="inv-profile__meta">{schoolCodes}</p>}
              <span className="inv-profile__role">{ROLE_LABEL[user?.role] || user?.role}</span>
            </div>
          </div>
          {onSwitchSchool && (
            <button
              type="button"
              role="menuitem"
              className="inv-profile__item"
              onClick={() => {
                setOpen(false);
                onSwitchSchool();
              }}
            >
              <RefreshCw size={16} aria-hidden /> Switch school
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className="inv-profile__item inv-profile__item--danger"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            <LogOut size={16} aria-hidden /> Log out
          </button>
        </div>
      )}
    </div>
  );
}

const Navbar = ({ onOpenMobileMenu, onLogout, onSwitchSchool }) => {
  const { user } = useContext(AuthContext);
  const location = useLocation();
  const [showNotifications, setShowNotifications] = useState(false);
  const bellRef = useDismiss(showNotifications, setShowNotifications);
  const pageTitle = getPageTitle(location.pathname);

  const isSchool = user?.role === 'School';
  const schoolDisplayName = isSchool
    ? formatSchoolDisplayName(wizklubSchoolNameToBranch(user?.name))
    : '';
  const srCode = user?.srCode || user?.schoolCode;
  const schoolCodes = isSchool && (srCode || user?.wizklubSchoolId)
    ? [
      srCode ? `SR: ${srCode}` : null,
      user?.wizklubSchoolId && user.wizklubSchoolId !== srCode ? `ID: ${user.wizklubSchoolId}` : null,
    ].filter(Boolean).join(' · ')
    : '';
  const canSwitchSchool = user?.loginType === 'instructor' && !isEmbeddedInventory();
  const firstName = String(user?.name || '').trim().split(/\s+/)[0];

  return (
    <header className="inv-topbar">
      <div className="inv-topbar__left">
        {onOpenMobileMenu && (
          <button
            type="button"
            onClick={onOpenMobileMenu}
            className="inv-icon-btn inv-topbar__menu lg:hidden"
            aria-label="Open navigation menu"
          >
            <Menu size={22} aria-hidden />
          </button>
        )}
        <BrandLogo className="inv-topbar__logo" />
        {isSchool && (
          <div className="inv-topbar__school-mobile min-w-0 lg:hidden">
            <p className="truncate text-[13px] font-semibold leading-5 text-wk-ink" title={schoolDisplayName}>
              {schoolDisplayName}
            </p>
            {schoolCodes && <p className="truncate text-xs leading-4 text-wk-muted">{schoolCodes}</p>}
          </div>
        )}
        <div className="inv-topbar__context">
          {isSchool ? (
            <>
              <p className="inv-topbar__title truncate" title={schoolDisplayName}>{schoolDisplayName}</p>
              <p className="inv-topbar__greeting truncate">
                {schoolCodes || pageTitle}
              </p>
            </>
          ) : (
            <p className="inv-topbar__greeting truncate">
              Hi{firstName ? `, ${firstName}` : ''} <span aria-hidden>👋</span>
              <span className="mx-2 text-wk-control" aria-hidden>·</span>
              <span className="text-wk-muted">{ROLE_LABEL[user?.role] || pageTitle}</span>
            </p>
          )}
        </div>
      </div>

      <div className="inv-topbar__right">
        {canSwitchSchool && (
          <button
            type="button"
            onClick={onSwitchSchool}
            className="wk-btn-secondary !hidden !min-h-[40px] !px-4 sm:!inline-flex"
            aria-label="Switch school"
          >
            <RefreshCw size={16} aria-hidden />
            <span className="hidden sm:inline">Switch school</span>
          </button>
        )}
        <div className="relative" ref={bellRef}>
          <button
            type="button"
            onClick={() => setShowNotifications(!showNotifications)}
            className="inv-icon-btn"
            aria-label="Notifications"
            aria-expanded={showNotifications}
          >
            <Bell size={20} aria-hidden />
          </button>

          {showNotifications && (
            <div className="absolute right-0 z-50 mt-2 w-72 glass-dropdown" role="dialog" aria-label="Notifications">
              <div className="border-b border-wk-line px-4 py-3">
                <h3 className="text-base font-semibold text-wk-ink">Notifications</h3>
              </div>
              <div className="inv-empty m-3 !py-6">
                <Bell size={20} aria-hidden />
                <p className="inv-empty__text">No new notifications</p>
              </div>
            </div>
          )}
        </div>

        <ProfileMenu
          user={user}
          schoolCodes={schoolCodes}
          onLogout={onLogout}
          onSwitchSchool={canSwitchSchool ? onSwitchSchool : null}
        />
      </div>
    </header>
  );
};

export default Navbar;
