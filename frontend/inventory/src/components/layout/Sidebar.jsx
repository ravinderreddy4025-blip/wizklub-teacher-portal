import React, { useContext } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { Headphones, LogOut, PanelLeft, Plus, X } from 'lucide-react';
import { AuthContext } from '../../context/AuthContext';
import { useAmApprovalCounts } from '../../context/AmApprovalCountsContext';
import { useAdminApprovalCounts } from '../../context/AdminApprovalCountsContext';
import logoWhite from '../../assets/wizklub-logo-white.png';
import { getNavGroups, ROLE_LABEL } from './navLinks';
import { ROLE_HOME, ROUTES } from '../../utils/routes';

/*
 * IL sidebar in WizKlub colours.
 *  ≥ 1024: transparent on the solid #E8661E frame, WHITE text/icons, white active pill with orange
 *          text (= Teachers Portal, option C); collapses to an 88px icon rail (state persisted by Layout).
 *  < 1024: the same list as a navy drawer (opened from the top bar / bottom-nav "More").
 */
const Sidebar = ({ collapsed = false, mobileOpen = false, onMobileClose, onToggleCollapse, onLogout }) => {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const { counts: amApprovalCounts } = useAmApprovalCounts();
  const { counts: adminApprovalCounts } = useAdminApprovalCounts();
  const groups = getNavGroups(user?.role);
  const isAdmin = user?.role === 'Admin';

  const handleNavClick = () => {
    if (onMobileClose) onMobileClose();
  };

  const handleNewDispatch = () => {
    handleNavClick();
    navigate(ROUTES.admin.overview, { state: { openDispatch: true } });
  };

  const countFor = (to) => {
    if (user?.role === 'AM' && to === ROUTES.am.approvals) return amApprovalCounts.total || 0;
    if (user?.role === 'Admin' && to === ROUTES.admin.replacements) return adminApprovalCounts.total || 0;
    if (user?.role === 'Admin' && to === ROUTES.admin.auditsReview) return adminApprovalCounts.auditReview || 0;
    return 0;
  };

  const homePath = ROLE_HOME[user?.role] || ROUTES.home;

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          className="inv-sidebar__scrim"
          onClick={onMobileClose}
          aria-label="Close menu"
        />
      )}

      <aside
        className={clsx(
          'inv-sidebar',
          mobileOpen && 'inv-sidebar--open',
          collapsed && 'inv-sidebar--collapsed',
        )}
        aria-label="Main navigation"
      >
        <div className="inv-sidebar__brand">
          <button
            type="button"
            className="inv-sidebar__logo-btn"
            onClick={() => {
              handleNavClick();
              navigate(homePath);
            }}
            aria-label="WizKlub Kit Inventory — home"
          >
            <img src={logoWhite} alt="" className="inv-sidebar__logo" />
          </button>

          <button
            type="button"
            onClick={onToggleCollapse}
            className="inv-sidebar__icon-btn hidden lg:flex"
            aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
            title={collapsed ? 'Expand menu' : 'Collapse menu'}
          >
            <PanelLeft size={18} aria-hidden />
          </button>

          <button
            type="button"
            onClick={onMobileClose}
            className="inv-sidebar__icon-btn lg:hidden"
            aria-label="Close menu"
          >
            <X size={20} aria-hidden />
          </button>
        </div>

        <p className={clsx('inv-sidebar__product', collapsed && 'lg:hidden')}>
          Kit Inventory
          <span>{ROLE_LABEL[user?.role] || user?.role || 'Portal'}</span>
        </p>

        <nav className="inv-sidebar__groups">
          {groups.map((group, index) => (
            <div key={group.label} className="inv-sidebar__group">
              {collapsed ? (
                <>
                  {index > 0 && <span className="inv-sidebar__divider hidden lg:block" aria-hidden />}
                  <p className="inv-sidebar__group-label lg:hidden">{group.label}</p>
                </>
              ) : (
                <p className="inv-sidebar__group-label">{group.label}</p>
              )}
              {group.items.map((link) => {
                const Icon = link.icon;
                const count = countFor(link.to);
                return (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    end={link.end}
                    onClick={handleNavClick}
                    title={collapsed ? link.label : undefined}
                    className={({ isActive }) => clsx('inv-sidebar__item', isActive && 'inv-sidebar__item--active')}
                  >
                    <Icon size={18} strokeWidth={2} className="shrink-0" aria-hidden />
                    <span className={clsx('inv-sidebar__label', collapsed && 'lg:sr-only')}>
                      {link.label}
                      {count > 0 && !collapsed && (
                        <span className="inv-sidebar__count" aria-label={`${count} pending`}>{count}</span>
                      )}
                    </span>
                    {count > 0 && collapsed && (
                      <span className="inv-sidebar__count" aria-label={`${count} pending`}>{count}</span>
                    )}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="inv-sidebar__footer">
          {isAdmin && (
            <button
              type="button"
              onClick={handleNewDispatch}
              className="inv-sidebar__cta"
              title={collapsed ? 'New dispatch' : undefined}
            >
              <Plus size={18} aria-hidden />
              <span className={clsx(collapsed && 'lg:sr-only')}>New dispatch</span>
            </button>
          )}
          {isAdmin && (
            <a
              href="mailto:support@wizklub.com"
              className="inv-sidebar__item"
              title={collapsed ? 'Support' : undefined}
            >
              <Headphones size={18} className="shrink-0" aria-hidden />
              <span className={clsx(collapsed && 'lg:sr-only')}>Support</span>
            </a>
          )}
          {onLogout && (
            <button
              type="button"
              className="inv-sidebar__item"
              onClick={onLogout}
              title={collapsed ? 'Log out' : undefined}
            >
              <LogOut size={18} className="shrink-0" aria-hidden />
              <span className={clsx(collapsed && 'lg:sr-only')}>Log out</span>
            </button>
          )}
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
