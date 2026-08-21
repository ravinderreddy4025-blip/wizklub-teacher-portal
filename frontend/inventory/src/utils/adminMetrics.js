import { ROUTES } from './routes';

export function getCurrentAuditMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}`;
}

export function computeAdminMetrics(data, stats = null) {
  if (stats) {
    return {
      totalSchools: stats.totalSchoolsCount ?? 0,
      totalKits: stats.totalKits ?? 0,
      warehouseStock: stats.warehouseStock ?? 0,
      activeInventory: stats.activeInventory ?? 0,
      missingInventory: stats.missingInventory ?? 0,
      pendingAudits: stats.pendingAudits ?? 0,
      pendingAcknowledgments: stats.pendingAcknowledgments ?? 0,
      pendingReplacements: stats.pendingAdminApprovals ?? 0,
      pendingReceiptIssues: stats.pendingReceiptIssues ?? 0,
      pendingReplacementRequests: stats.pendingReplacementRequests ?? 0,
      pendingAdminApprovals: stats.pendingAdminApprovals ?? 0,
      auditMismatches: stats.auditMismatches ?? 0,
      totalDispatches: stats.dispatchSummary?.reduce((sum, row) => sum + (row.count || 0), 0) ?? 0,
    };
  }

  const { dispatches = [], audits = [], schools = [], kits = [], requests = [], receiptIssues = [], warehouseTotal } = data;
  const currentMonth = getCurrentAuditMonth();

  const pendingReceiptIssues = (receiptIssues || []).filter((i) => i.status === 'Pending Admin Approval').length;
  const pendingReplacementRequests = requests.length;
  const pendingAdminApprovals = pendingReceiptIssues + pendingReplacementRequests;

  const warehouseStock = warehouseTotal ?? kits.reduce((sum, k) => sum + (k.warehouseQuantity || 0), 0);

  const activeInventory = dispatches
    .filter((d) => d.status === 'Received' || d.status === 'Delivery Completed' || d.status === 'Completed')
    .reduce((sum, d) => sum + (d.quantityReceived ?? d.quantity ?? 0), 0);

  const missingInventory = audits.reduce((sum, audit) => {
    return sum + (audit.items || []).reduce((s, item) => s + (item.lostQuantity || 0), 0);
  }, 0);

  const schoolsWithAuditThisMonth = new Set(
    audits.filter((a) => a.month === currentMonth).map((a) => a.school?._id || a.school)
  );
  const pendingAudits = schools.filter((s) => !schoolsWithAuditThisMonth.has(s._id)).length;

  const pendingAcknowledgments = dispatches.filter((d) => d.status === 'Dispatched').length;

  return {
    totalSchools: schools.length,
    totalKits: kits.length,
    warehouseStock,
    activeInventory,
    missingInventory,
    pendingAudits,
    pendingAcknowledgments,
    pendingReplacements: pendingAdminApprovals,
    pendingReceiptIssues,
    pendingReplacementRequests,
    pendingAdminApprovals,
    auditMismatches: audits.filter((a) => a.status === 'Mismatch').length,
    totalDispatches: dispatches.length,
  };
}

export function getSchoolsNeedingAttention(data) {
  const { dispatches = [], audits = [], schools = [], requests = [] } = data;
  const currentMonth = getCurrentAuditMonth();

  return schools
    .map((school) => {
      const schoolId = school._id;
      const pendingAck = dispatches.filter(
        (d) => (d.school?._id || d.school) === schoolId && d.status === 'Dispatched'
      ).length;
      const hasMismatch = audits.some(
        (a) => (a.school?._id || a.school) === schoolId && a.status === 'Mismatch'
      );
      const hasAuditThisMonth = audits.some(
        (a) => (a.school?._id || a.school) === schoolId && a.month === currentMonth
      );
      const pendingReplace = requests.filter(
        (r) => (r.school?._id || r.school) === schoolId
      ).length;

      const score = pendingAck * 3 + (hasMismatch ? 2 : 0) + (!hasAuditThisMonth ? 1 : 0) + pendingReplace * 2;

      return {
        school,
        pendingAck,
        hasMismatch,
        needsAudit: !hasAuditThisMonth,
        pendingReplace,
        score,
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function getAdminActiveView(pathname) {
  if (pathname.includes('/warehouse') || pathname.includes('/inventory')) return 'warehouse';
  if (pathname.includes('/dispatches')) return 'dispatches';
  if (pathname.includes('/schools')) return 'schools';
  if (pathname.includes('/account-managers')) return 'accountManagers';
  if (pathname.includes('/divisions') || pathname.includes('/network')) return 'divisions';
  if (pathname.includes('/audits/review')) return 'auditReview';
  if (pathname.includes('/audits')) return 'auditSubmissions';
  if (pathname.includes('/reports')) return 'reports';
  if (pathname.includes('/replacements') || pathname.includes('/requests')) return 'replacements';
  if (pathname === ROUTES.admin.overview || pathname === `${ROUTES.admin.overview}/`) return 'overview';
  return 'invalid';
}

export const ADMIN_HEADER_COPY = {
  overview: {
    title: 'System Overview',
    subtitle: 'Real-time logistics and operational metrics.',
  },
  warehouse: {
    title: 'Warehouse & Kits',
    subtitle: 'Global kit stock, catalog management, and bulk Excel upload.',
  },
  inventory: {
    title: 'Warehouse & Kits',
    subtitle: 'Global kit stock, catalog management, and bulk Excel upload.',
  },
  dispatches: {
    title: 'Dispatch Management',
    subtitle: 'Select a division, then a school, to view dispatches or create a new shipment.',
  },
  schools: {
    title: 'School Registry',
    subtitle: 'Add and manage schools — assign each school to a division within the Wizklub ecosystem.',
  },
  divisions: {
    title: 'Divisions',
    subtitle: 'Create divisions and assign Account Managers. Audit dates are scheduled in the Audits section.',
  },
  accountManagers: {
    title: 'Account Managers',
    subtitle: 'One AM can handle multiple divisions. Each division is assigned to only one AM.',
  },
  audits: {
    title: 'Audit Submissions',
    subtitle: 'Schedule division audit windows and monitor school submissions.',
  },
  auditSubmissions: {
    title: 'Audit Submissions',
    subtitle: 'Schedule division audit windows and monitor school submissions.',
  },
  auditReview: {
    title: 'Audit Review',
    subtitle: 'Check AM-approved audits, approve quantities, and dispatch lost/damaged replacements.',
  },
  replacements: {
    title: 'Replacement Management',
    subtitle: 'Approve replacements from monthly audit and normal dispatch, then ship to schools.',
  },
  reports: {
    title: 'Reports',
    subtitle: 'Monthly kit operations summary and per-school consolidated PDF downloads.',
  },
};

export const LIFECYCLE_STAGES = [
  'Procurement',
  'Warehouse',
  'Dispatch',
  'School Receipt',
  'Usage',
  'Monthly Audit',
  'Quarterly Audit',
  'Teacher Handover',
  'Replacement',
];

export const ADMIN_MODULES = [
  { to: ROUTES.admin.warehouse, icon: 'Package', label: 'Warehouse', desc: 'Global kit stock' },
  { to: ROUTES.admin.dispatches, icon: 'Truck', label: 'Dispatches', desc: 'Create & track shipments' },
  { to: ROUTES.admin.schools, icon: 'GraduationCap', label: 'Schools', desc: 'School registry' },
  { to: ROUTES.admin.divisions, icon: 'Building2', label: 'Divisions', desc: 'Audit windows' },
  { to: ROUTES.admin.accountManagers, icon: 'Users', label: 'Account Managers', desc: 'Division heads' },
  { to: ROUTES.admin.audits, icon: 'ClipboardCheck', label: 'Audit Submissions', desc: 'Windows & compliance' },
  { to: ROUTES.admin.auditsReview, icon: 'ClipboardCheck', label: 'Audit Review', desc: 'Approve & dispatch' },
  { to: ROUTES.admin.replacements, icon: 'RefreshCw', label: 'Replacements', desc: 'Approval queue' },
  { to: ROUTES.admin.reports, icon: 'FileText', label: 'Reports', desc: 'Registry export' },
];
