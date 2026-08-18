import React, { useContext } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { Headphones, Menu, Plus, X } from 'lucide-react';
import { AuthContext } from '../../context/AuthContext';
import { useAmApprovalCounts } from '../../context/AmApprovalCountsContext';
import { useAdminApprovalCounts } from '../../context/AdminApprovalCountsContext';
import BrandLogo from '../brand/BrandLogo';
import { getNavLinks } from './navLinks';
import { ROUTES } from '../../utils/routes';

const Sidebar = ({ collapsed = false, mobileOpen = false, onMobileClose, onToggleCollapse }) => {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const { counts: amApprovalCounts } = useAmApprovalCounts();
  const { counts: adminApprovalCounts } = useAdminApprovalCounts();
  const links = getNavLinks(user?.role);
  const isAdmin = user?.role === 'Admin';
  const isAm = user?.role === 'AM';

  const handleNavClick = () => {
    if (onMobileClose) onMobileClose();
  };

  const handleNewDispatch = () => {
    handleNavClick();
    navigate(ROUTES.admin.overview, { state: { openDispatch: true } });
  };

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
          onClick={onMobileClose}
          aria-label="Close menu"
        />
      )}

      <aside
        className={clsx(
          'h-full glass-sidebar flex flex-col overflow-hidden transition-all duration-300 ease-in-out z-50',
          'fixed inset-y-0 left-0 w-64 md:relative md:translate-x-0 md:flex-shrink-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          collapsed ? 'md:w-[4.5rem]' : 'md:w-64',
        )}
      >
        <div
          className={clsx(
            'h-14 md:h-16 flex items-center border-b shrink-0 px-3 md:px-4',
            'border-[var(--stitch-border)]',
            collapsed ? 'md:justify-center' : 'justify-between',
          )}
        >
          {!collapsed ? (
            <div className="hidden md:flex min-w-0 items-center gap-2.5">
              <BrandLogo className="h-8 w-auto max-w-[36px]" />
              <div className="min-w-0">
                {isAdmin ? (
                  <>
                    <p className="truncate text-sm font-black text-[#1F2937] leading-tight">Command Shell</p>
                    <p className="text-[11px] font-medium text-[#6B7280]">Active Session</p>
                  </>
                ) : (
                  <>
                    <p className="truncate text-sm font-black tracking-tight text-[#1F2937] leading-tight">
                      Wizklub
                    </p>
                    <p className="text-[11px] font-medium text-[#6B7280]">
                      {isAm ? 'Account Manager' : user?.role || 'Portal'}
                    </p>
                  </>
                )}
              </div>
            </div>
          ) : null}

          <button
            type="button"
            onClick={onToggleCollapse}
            className="hidden md:flex glass-btn-ghost shrink-0"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand menu' : 'Collapse menu'}
          >
            <Menu size={20} />
          </button>

          <button
            type="button"
            onClick={onMobileClose}
            className="md:hidden glass-btn-ghost shrink-0"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        <div className={clsx('md:hidden px-4 py-3 border-b border-[var(--stitch-border)]', collapsed && 'hidden')}>
          {isAdmin ? (
            <>
              <p className="text-sm font-black text-[#1F2937]">Command Shell</p>
              <p className="text-[11px] font-medium text-[#6B7280]">Active Session</p>
            </>
          ) : (
            <>
              <p className="text-sm font-black text-[#1F2937]">Wizklub</p>
              <p className="text-[11px] font-medium text-[#6B7280]">
                {isAm ? 'Account Manager' : user?.role || 'Portal'}
              </p>
            </>
          )}
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-4">
          {links.map((link) => {
            const Icon = link.icon;
            return (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                onClick={handleNavClick}
                title={collapsed ? link.label : undefined}
                className={({ isActive }) =>
                  clsx(
                    'nav-link-glass',
                    isActive && 'nav-link-glass-active',
                    collapsed && 'md:justify-center md:px-0 md:gap-0',
                  )
                }
              >
                <Icon size={18} strokeWidth={2} className="shrink-0" />
                <span className={clsx('flex min-w-0 items-center gap-2', collapsed && 'md:hidden')}>
                  {link.label}
                  {user?.role === 'AM' && link.to === ROUTES.am.approvals && amApprovalCounts.total > 0 && (
                    <span className="approval-count-badge h-5 min-w-[1.25rem] text-[10px]">
                      {amApprovalCounts.total}
                    </span>
                  )}
                  {user?.role === 'Admin' && link.to === ROUTES.admin.replacements && adminApprovalCounts.total > 0 && (
                    <span className="approval-count-badge h-5 min-w-[1.25rem] text-[10px]">
                      {adminApprovalCounts.total}
                    </span>
                  )}
                  {user?.role === 'Admin' && link.to === ROUTES.admin.auditsReview && adminApprovalCounts.auditReview > 0 && (
                    <span className="approval-count-badge h-5 min-w-[1.25rem] text-[10px]">
                      {adminApprovalCounts.auditReview}
                    </span>
                  )}
                </span>
              </NavLink>
            );
          })}
        </nav>

        <div
          className={clsx(
            'shrink-0 border-t p-4',
            'border-[var(--stitch-border)]',
            collapsed && 'md:hidden',
          )}
        >
          {isAdmin ? (
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleNewDispatch}
                className="command-glow-shadow flex w-full items-center justify-center gap-1.5 rounded-full bg-[var(--stitch-primary)] px-3 py-2 text-[13px] font-bold text-white transition-opacity hover:opacity-90"
              >
                <Plus size={18} />
                New Dispatch
              </button>
              <a href="mailto:support@wizklub.com" className="nav-link-glass">
                <Headphones size={18} className="shrink-0" />
                Support
              </a>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-xl bg-[var(--stitch-canvas)] p-4">
              <div className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-[#22C55E]" />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                  System Status
                </p>
                <p className="text-xs font-semibold text-[#1F2937]">All systems online</p>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
