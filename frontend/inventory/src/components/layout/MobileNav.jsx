import React, { useContext, useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { useAmApprovalCounts } from '../../context/AmApprovalCountsContext';
import { useAdminApprovalCounts } from '../../context/AdminApprovalCountsContext';
import { ROUTES } from '../../utils/routes';
import {
  Home,
  Package,
  Truck,
  GraduationCap,
  Building2,
  ClipboardCheck,
  CheckSquare,
  FileText,
  Send,
  History,
  LayoutGrid,
} from 'lucide-react';

const ADMIN_MOBILE_PRIMARY = [
  { to: ROUTES.admin.overview, icon: Home, label: 'Home', end: true },
  { to: ROUTES.admin.dispatches, icon: Truck, label: 'Dispatch' },
  { to: ROUTES.admin.schools, icon: GraduationCap, label: 'Schools' },
];

const ADMIN_MOBILE_OVERFLOW = [
  ROUTES.admin.warehouse,
  ROUTES.admin.divisions,
  ROUTES.admin.accountManagers,
  ROUTES.admin.audits,
  ROUTES.admin.auditsReview,
  ROUTES.admin.replacements,
  ROUTES.admin.reports,
];

function routeMatches(pathname, target) {
  if (!target) return false;
  return pathname === target || pathname.startsWith(`${target}/`);
}

const MobileNav = ({ onOpenMoreMenu }) => {
  const { user } = useContext(AuthContext);
  const location = useLocation();
  const { counts: amApprovalCounts } = useAmApprovalCounts();
  const { counts: adminApprovalCounts } = useAdminApprovalCounts();

  const { links, showMore } = useMemo(() => {
    switch (user?.role) {
      case 'Admin':
        return { links: ADMIN_MOBILE_PRIMARY, showMore: true };
      case 'School':
        return {
          links: [
            { to: ROUTES.school.dispatches, icon: Truck, label: 'Kits', end: true },
            { to: ROUTES.school.warehouse, icon: Package, label: 'Stock' },
            { to: ROUTES.school.audit, icon: FileText, label: 'Audit' },
            { to: ROUTES.school.replacements, icon: CheckSquare, label: 'Replace' },
          ],
          showMore: false,
        };
      case 'AM':
        return {
          links: [
            { to: ROUTES.am.schools, icon: Building2, label: 'Schools', end: true },
            { to: ROUTES.am.dispatches, icon: Truck, label: 'Dispatch' },
            { to: ROUTES.am.audits, icon: ClipboardCheck, label: 'Audits' },
            { to: ROUTES.am.approvals, icon: CheckSquare, label: 'Approve' },
          ],
          showMore: false,
        };
      case 'Dispatch':
        return {
          links: [
            { to: ROUTES.dispatch.pending, icon: Send, label: 'Pending', end: true },
            { to: ROUTES.dispatch.history, icon: History, label: 'History' },
          ],
          showMore: false,
        };
      default:
        return { links: [], showMore: false };
    }
  }, [user?.role]);

  if (!links.length) return null;

  const moreBadgeCount = user?.role === 'Admin'
    ? (adminApprovalCounts.total || 0) + (adminApprovalCounts.auditReview || 0)
    : 0;

  const isMoreActive = showMore && ADMIN_MOBILE_OVERFLOW.some((path) => routeMatches(location.pathname, path));

  const renderBadge = (link) => {
    if (user?.role === 'AM' && link.to === ROUTES.am.approvals && amApprovalCounts.total > 0) {
      return (
        <span className="inv-bottom-nav__badge" aria-label={`${amApprovalCounts.total} pending`}>
          {amApprovalCounts.total}
        </span>
      );
    }
    return null;
  };

  return (
    <nav className="inv-bottom-nav" aria-label="Mobile navigation">
      {links.map((link) => {
        const Icon = link.icon;
        return (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={({ isActive }) =>
              `inv-bottom-nav__item ${isActive ? 'inv-bottom-nav__item--active' : ''}`
            }
          >
            <Icon size={20} aria-hidden />
            <span className="max-w-full truncate">{link.label}</span>
            {renderBadge(link)}
          </NavLink>
        );
      })}

      {showMore && (
        <button
          type="button"
          onClick={onOpenMoreMenu}
          className={`inv-bottom-nav__item ${isMoreActive ? 'inv-bottom-nav__item--active' : ''}`}
          aria-label="Open full menu"
        >
          <LayoutGrid size={20} aria-hidden />
          <span>More</span>
          {moreBadgeCount > 0 && (
            <span className="inv-bottom-nav__badge" aria-label={`${moreBadgeCount} pending`}>
              {moreBadgeCount}
            </span>
          )}
        </button>
      )}
    </nav>
  );
};

export default MobileNav;
