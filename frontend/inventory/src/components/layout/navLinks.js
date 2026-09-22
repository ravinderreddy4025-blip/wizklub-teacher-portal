import {
  Home,
  Package,
  Truck,
  GraduationCap,
  Building2,
  ClipboardCheck,
  ClipboardList,
  CheckSquare,
  FileText,
  Send,
  History,
  Users,
  Warehouse,
  RefreshCcw,
  BarChart3,
} from 'lucide-react';
import { ROUTES } from '../../utils/routes';

/**
 * Sidebar groups per role (IL pattern: labelled groups of 40px pill items).
 * Every route / `end` flag is unchanged from the previous flat list — only grouping and icons differ.
 */
export const getNavGroups = (role) => {
  switch (role) {
    case 'Admin':
      return [
        {
          label: 'Overview',
          items: [{ to: ROUTES.admin.overview, icon: Home, label: 'Dashboard', end: true }],
        },
        {
          label: 'Operations',
          items: [
            { to: ROUTES.admin.warehouse, icon: Warehouse, label: 'Warehouse' },
            { to: ROUTES.admin.dispatches, icon: Truck, label: 'Dispatches' },
            { to: ROUTES.admin.replacements, icon: RefreshCcw, label: 'Replacements' },
          ],
        },
        {
          label: 'Network',
          items: [
            { to: ROUTES.admin.schools, icon: GraduationCap, label: 'Schools' },
            { to: ROUTES.admin.divisions, icon: Building2, label: 'Divisions' },
            { to: ROUTES.admin.accountManagers, icon: Users, label: 'Account Managers' },
          ],
        },
        {
          label: 'Audits',
          items: [
            { to: ROUTES.admin.audits, icon: ClipboardList, label: 'Audit Submissions', end: true },
            { to: ROUTES.admin.auditsReview, icon: ClipboardCheck, label: 'Audit Review' },
          ],
        },
        {
          label: 'Insights',
          items: [{ to: ROUTES.admin.reports, icon: BarChart3, label: 'Reports' }],
        },
      ];
    case 'School':
      return [
        {
          label: 'Kits',
          items: [
            { to: ROUTES.school.dispatches, icon: Truck, label: 'Dispatches', end: true },
            { to: ROUTES.school.warehouse, icon: Package, label: 'Warehouse' },
          ],
        },
        {
          label: 'Checks',
          items: [
            { to: ROUTES.school.audit, icon: FileText, label: 'Monthly Audit' },
            { to: ROUTES.school.replacements, icon: CheckSquare, label: 'Replacements' },
          ],
        },
      ];
    case 'AM':
      return [
        {
          label: 'My division',
          items: [
            { to: ROUTES.am.schools, icon: Building2, label: 'Schools', end: true },
            { to: ROUTES.am.dispatches, icon: Truck, label: 'Dispatches' },
          ],
        },
        {
          label: 'Reviews',
          items: [
            { to: ROUTES.am.audits, icon: ClipboardCheck, label: 'Audits' },
            { to: ROUTES.am.approvals, icon: CheckSquare, label: 'Approvals' },
          ],
        },
      ];
    case 'Dispatch':
      return [
        {
          label: 'Dispatch desk',
          items: [
            { to: ROUTES.dispatch.pending, icon: Send, label: 'Pending', end: true },
            { to: ROUTES.dispatch.history, icon: History, label: 'History' },
          ],
        },
      ];
    default:
      return [];
  }
};

export const getNavLinks = (role) => getNavGroups(role).flatMap((group) => group.items);

export const ROLE_LABEL = {
  Admin: 'Administrator',
  AM: 'Account Manager',
  Dispatch: 'Dispatch team',
  School: 'School',
};
