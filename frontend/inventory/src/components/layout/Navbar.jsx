import React, { useContext, useState } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { Bell, LogOut, Menu, RefreshCw } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getPageTitle, ROUTES } from '../../utils/routes';
import BrandLogo from '../brand/BrandLogo';
import { formatSchoolDisplayName, wizklubSchoolNameToBranch } from '../../utils/schoolName';
import { isEmbeddedInventory } from '../../utils/embed';

const Navbar = ({ onOpenMobileMenu }) => {
  const { user, logout, switchInstructorSchool } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  const [showNotifications, setShowNotifications] = useState(false);
  const pageTitle = getPageTitle(location.pathname);
  const isAdmin = user?.role === 'Admin';
  const showNavPageTitle = !isAdmin;

  const handleLogout = async () => {
    await logout();
    navigate(ROUTES.home);
  };

  const handleSwitchSchool = () => {
    switchInstructorSchool();
    navigate(ROUTES.login.schoolInstructorSelect);
  };

  const isSchool = user?.role === 'School';
  const schoolDisplayName = isSchool
    ? formatSchoolDisplayName(wizklubSchoolNameToBranch(user?.name))
    : '';
  const canSwitchSchool = user?.loginType === 'instructor' && !isEmbeddedInventory();

  return (
    <header className="z-30 flex h-14 shrink-0 items-center justify-between border-b border-[var(--stitch-border)] bg-white px-3 md:h-16 md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        {onOpenMobileMenu && (
          <button
            type="button"
            onClick={onOpenMobileMenu}
            className="md:hidden nav-btn-light shrink-0"
            aria-label="Open navigation menu"
          >
            <Menu size={22} />
          </button>
        )}
        <BrandLogo className="hidden h-8 w-auto max-w-[120px] sm:block lg:max-w-[132px]" />
        <span className="hidden shrink-0 items-center rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-[var(--stitch-primary)] sm:inline-flex">
          {user?.role}
        </span>
        {isSchool ? (
          <div className="min-w-0">
            <p
              className="truncate text-[11px] font-bold leading-tight text-brand-primary sm:text-xs"
              title={schoolDisplayName}
            >
              {schoolDisplayName}
            </p>
            {showNavPageTitle && (
              <p className="truncate font-heading text-sm font-bold tracking-tight text-[#1F2937] md:text-base">
                {pageTitle}
              </p>
            )}
          </div>
        ) : (
          showNavPageTitle && (
            <p className="truncate font-heading text-sm font-bold tracking-tight text-[#1F2937] md:text-base">
              {pageTitle}
            </p>
          )
        )}
      </div>

      <div className="flex items-center gap-2 md:gap-4 shrink-0">
        {canSwitchSchool && (
          <button
            type="button"
            onClick={handleSwitchSchool}
            className="inline-flex items-center gap-1 rounded-lg border border-orange-200 bg-orange-50 px-2 py-1.5 text-[10px] font-bold text-brand-primary transition-colors hover:bg-orange-100 sm:gap-1.5 sm:px-3 sm:text-xs"
            aria-label="Switch school"
          >
            <RefreshCw size={14} />
            <span className="hidden min-[420px]:inline">Switch school</span>
            <span className="min-[420px]:hidden">Switch</span>
          </button>
        )}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowNotifications(!showNotifications)}
            className="nav-btn-light relative"
            aria-label="Notifications"
            aria-expanded={showNotifications}
          >
            <Bell size={20} />
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-3 w-80 glass-dropdown z-50">
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="font-semibold text-slate-900">Notifications</h3>
              </div>
              <div className="p-4">
                <p className="text-sm text-slate-500 text-center py-4">No new notifications</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 md:gap-3 pl-3 md:pl-4 border-l border-slate-200">
          <div className="hidden md:block text-right">
            <p className="text-sm font-heading font-bold text-slate-900 leading-none mb-1">{user?.name}</p>
            <p className="text-xs text-slate-500 font-ui leading-none">{user?.role}</p>
          </div>
          <div className="w-9 h-9 md:w-10 md:h-10 glass-avatar shrink-0 text-xs font-bold tracking-wide">
            {(user?.name || 'U')
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((part) => part[0]?.toUpperCase())
              .join('') || 'U'}
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="nav-btn-light"
            title="Logout"
          >
            <LogOut size={20} />
          </button>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
