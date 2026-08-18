import {

  Shield,

  Building2,

  GraduationCap,

} from 'lucide-react';



export const ROUTES = {

  home: '/',

  login: {

    admin: '/login/admin',

    school: '/login/school',

    schoolInstructorSelect: '/login/school/select',

    am: '/login/am',

    dispatch: '/login/dispatch',

  },

  admin: {

    root: '/admin',

    overview: '/admin',

    warehouse: '/admin/warehouse',

    inventory: '/admin/warehouse',

    dispatches: '/admin/dispatches',

    /** @param {string} divisionId */
    dispatchesDivision: (divisionId) => `/admin/dispatches/${divisionId}`,

    /** @param {string} divisionId @param {string} schoolId */
    dispatchesSchool: (divisionId, schoolId) => `/admin/dispatches/${divisionId}/${schoolId}`,

    schools: '/admin/schools',

    divisions: '/admin/divisions',

    accountManagers: '/admin/account-managers',

    /** @deprecated use divisions */

    network: '/admin/divisions',

    audits: '/admin/audits',

    auditsReview: '/admin/audits/review',

    replacements: '/admin/replacements',

    replacementsMismatch: '/admin/replacements/mismatch',

    replacementsMissing: '/admin/replacements/missing',

    replacementsLost: '/admin/replacements/lost',

    replacementsDamaged: '/admin/replacements/damaged',

    reports: '/admin/reports',

  },

  school: {

    root: '/school',

    dispatches: '/school',

    warehouse: '/school/warehouse',

    audit: '/school/audit',

    replacements: '/school/replacements',

  },

  am: {

    root: '/am',

    schools: '/am',

    dispatches: '/am/dispatches',

    audits: '/am/audits',

    approvals: '/am/approvals',

    approvalsMismatch: '/am/approvals/mismatch',

    approvalsMissing: '/am/approvals/missing',

    approvalsLost: '/am/approvals/lost',

    approvalsDamaged: '/am/approvals/damaged',

  },

  dispatch: {

    root: '/dispatch',

    pending: '/dispatch',

    history: '/dispatch/history',

  },

};



export const ROLE_HOME = {

  Admin: ROUTES.admin.root,

  School: ROUTES.school.root,

  AM: ROUTES.am.root,

  Dispatch: ROUTES.dispatch.root,

};



export const ROLE_LOGIN = {

  Admin: ROUTES.login.admin,

  School: ROUTES.login.school,

  AM: ROUTES.login.am,

  Dispatch: ROUTES.login.dispatch,

};



export const ROLE_PORTALS = [

  {

    role: 'Admin',

    label: 'Administrator',

    tagline: 'Operations command center',

    description: 'Manage schools, divisions, inventory, replacements, and global reports.',

    path: ROUTES.login.admin,

    home: ROUTES.admin.root,

    icon: Shield,

    accent: 'from-brand-primary via-brand-orange-light to-brand-deep',

    glow: 'shadow-glow-orange',

    demoEmail: 'admin@wizklub.com',

    demoPassword: 'password123',

  },

  {

    role: 'AM',

    label: 'Account Manager',

    tagline: 'Division oversight',

    description: 'Monitor schools in your division, review audits, and approve replacements.',

    path: ROUTES.login.am,

    home: ROUTES.am.root,

    icon: Building2,

    accent: 'from-brand-primary to-brand-orange-light',

    glow: 'shadow-glow-orange',

    demoEmail: 'am@wizklub.com',

    demoPassword: 'password123',

  },

  {

    role: 'School',

    label: 'School Portal',

    tagline: 'On-ground inventory',

    description: 'Confirm dispatches, submit monthly audits, and request kit replacements.',

    path: ROUTES.login.school,

    home: ROUTES.school.root,

    icon: GraduationCap,

    accent: 'from-brand-primary to-brand-orange-light',

    glow: 'shadow-glow-orange',

    demoEmail: 'school@wizklub.com',

    demoSchoolId: 'SHS001',

    demoPassword: 'password123',

  },

];



export function getPortalByRole(role) {

  return ROLE_PORTALS.find((p) => p.role === role);

}



export const PAGE_TITLES = {

  '/': 'Home',

  [ROUTES.login.admin]: 'Admin Login',

  [ROUTES.login.school]: 'School Login',

  [ROUTES.login.schoolInstructorSelect]: 'Select School',

  [ROUTES.login.am]: 'Account Manager Login',

  [ROUTES.login.dispatch]: 'Dispatch Login',

  '/admin': 'Dashboard',

  '/admin/warehouse': 'Warehouse & Kits',

  '/admin/inventory': 'Warehouse & Kits',

  '/admin/dispatches': 'Dispatch Management',

  '/admin/schools': 'School Registry',

  '/admin/divisions': 'Divisions',

  '/admin/network': 'Divisions & Audit Windows',

  '/admin/account-managers': 'Account Managers',

  '/admin/audits': 'Audit Submissions',

  '/admin/audits/review': 'Audit Review',

  '/admin/replacements': 'Replacements',

  '/admin/replacements/missing': 'Missing product',

  '/admin/replacements/lost': 'Lost product',

  '/admin/replacements/damaged': 'Damaged product',

  '/admin/replacements/mismatch': 'Quantity mismatch',

  '/admin/reports': 'Reports',

  '/school': 'Dispatches',

  '/school/warehouse': 'School Warehouse',

  '/school/audit': 'Monthly Audit',

  '/school/replacements': 'Replacements',

  '/am': 'Account Manager',

  '/am/dispatches': 'Dispatches',

  '/am/audits': 'Audits',

  '/am/approvals': 'Approvals',

  '/am/approvals/mismatch': 'Quantity Mismatch',

  '/am/approvals/missing': 'Missing Product',

  '/am/approvals/lost': 'Lost Product',

  '/am/approvals/damaged': 'Damaged Product',

  '/dispatch': 'Pending Shipments',

  '/dispatch/history': 'Dispatch History',

};



export function getPageTitle(pathname) {

  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];

  if (pathname.startsWith('/login')) return 'Sign In';

  if (pathname.startsWith('/admin')) return 'Admin';

  if (pathname.startsWith('/school')) return 'School';

  if (pathname.startsWith('/am')) return 'Account Manager';

  if (pathname.startsWith('/dispatch')) return 'Dispatch';

  return 'WizKlub';

}


