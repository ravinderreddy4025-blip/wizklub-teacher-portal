import { IconFeedback, IconHome, IconProfile, IconSchools } from '../icons/Icons'

export const NAV_ITEMS = [
  { id: 'home', label: 'Dashboard', path: '/dashboard', Icon: IconHome },
  { id: 'schools', label: 'Schools', path: '/schools', Icon: IconSchools },
  { id: 'feedback', label: 'Support', path: '/feedback', Icon: IconFeedback },
  { id: 'profile', label: 'Profile', path: '/profile', Icon: IconProfile },
]

export function resolveActiveTab(path, active) {
  if (active) return active
  if (path.startsWith('/dashboard') || path === '/home') return 'home'
  if (path.startsWith('/schools') || path.startsWith('/batches') || path.startsWith('/students')) {
    return 'schools'
  }
  if (path.startsWith('/feedback')) return 'feedback'
  if (path.startsWith('/profile')) return 'profile'
  return undefined
}
