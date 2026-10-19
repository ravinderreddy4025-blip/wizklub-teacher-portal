import {
  IconAnalytics,
  IconFeedback,
  IconHome,
  IconInventory,
  IconProfile,
  IconSchools,
  IconUsers,
} from '../icons/Icons'

export const NAV_ITEMS = [
  { id: 'home', label: 'Dashboard', path: '/dashboard', Icon: IconHome },
  { id: 'schools', label: 'Schools', path: '/schools', Icon: IconSchools },
  { id: 'analytics', label: 'Analytics', path: '/analytics', Icon: IconAnalytics },
  { id: 'feedback', label: 'Support', path: '/feedback', Icon: IconFeedback },
  { id: 'profile', label: 'Profile', path: '/profile', Icon: IconProfile },
]

/** Desktop sidebar groups (LMS / CS Portal pattern). Mobile bottom nav keeps NAV_ITEMS. */
export const NAV_GROUPS = [
  {
    label: 'Workspace',
    items: [
      { id: 'home', label: 'Dashboard', path: '/dashboard', Icon: IconHome },
      { id: 'schools', label: 'Schools', path: '/schools', Icon: IconSchools },
      { id: 'analytics', label: 'Analytics', path: '/analytics', Icon: IconAnalytics },
      {
        id: 'analytics-report',
        label: 'Analytics Report',
        path: '/analytics-report',
        Icon: IconUsers,
      },
    ],
  },
  {
    label: 'Operations',
    items: [{ id: 'inventory', label: 'Kit inventory', path: '/inventory', Icon: IconInventory }],
  },
  {
    label: 'Help',
    items: [
      { id: 'feedback', label: 'Support', path: '/feedback', Icon: IconFeedback },
      { id: 'profile', label: 'Profile', path: '/profile', Icon: IconProfile },
    ],
  },
]

export function resolveActiveTab(path, active) {
  if (active) return active
  if (path.startsWith('/dashboard') || path === '/home') return 'home'
  if (path.startsWith('/schools') || path.startsWith('/batches') || path.startsWith('/students')) {
    return 'schools'
  }
  if (path.startsWith('/analytics-report') || path.startsWith('/student-health-report')) {
    return 'analytics-report'
  }
  if (path.startsWith('/analytics')) return 'analytics'
  if (path.startsWith('/feedback')) return 'feedback'
  if (path.startsWith('/inventory')) return 'inventory'
  if (path.startsWith('/profile')) return 'profile'
  return undefined
}
