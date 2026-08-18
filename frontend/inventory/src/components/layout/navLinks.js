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
  Users,
} from 'lucide-react';
import { ROUTES } from '../../utils/routes';

export const getNavLinks = (role) => {
  switch (role) {
    case 'Admin':
      return [
        { to: ROUTES.admin.overview, icon: Home, label: 'Dashboard', end: true },
        { to: ROUTES.admin.warehouse, icon: Package, label: 'Warehouse' },
        { to: ROUTES.admin.dispatches, icon: Truck, label: 'Dispatches' },
        { to: ROUTES.admin.schools, icon: GraduationCap, label: 'Schools' },
        { to: ROUTES.admin.divisions, icon: Building2, label: 'Divisions' },
        { to: ROUTES.admin.accountManagers, icon: Users, label: 'Account Managers' },
        { to: ROUTES.admin.audits, icon: ClipboardCheck, label: 'Audit Submissions', end: true },
        { to: ROUTES.admin.auditsReview, icon: ClipboardCheck, label: 'Audit Review' },
        { to: ROUTES.admin.replacements, icon: CheckSquare, label: 'Replacements' },
        { to: ROUTES.admin.reports, icon: FileText, label: 'Reports' },
      ];
    case 'School':
      return [
        { to: ROUTES.school.dispatches, icon: Package, label: 'Dispatches', end: true },
        { to: ROUTES.school.warehouse, icon: Package, label: 'Warehouse' },
        { to: ROUTES.school.audit, icon: FileText, label: 'Monthly Audit' },
        { to: ROUTES.school.replacements, icon: CheckSquare, label: 'Replacements' },
      ];
    case 'AM':
      return [
        { to: ROUTES.am.schools, icon: Building2, label: 'Schools', end: true },
        { to: ROUTES.am.dispatches, icon: Truck, label: 'Dispatches' },
        { to: ROUTES.am.audits, icon: ClipboardCheck, label: 'Audits' },
        { to: ROUTES.am.approvals, icon: CheckSquare, label: 'Approvals' },
      ];
    case 'Dispatch':
      return [
        { to: ROUTES.dispatch.pending, icon: Send, label: 'Pending', end: true },
        { to: ROUTES.dispatch.history, icon: History, label: 'History' },
      ];
    default:
      return [];
  }
};
