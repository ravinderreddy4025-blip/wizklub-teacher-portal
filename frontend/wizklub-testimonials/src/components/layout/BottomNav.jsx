import { useNavigate, usePath } from '../../router'
import { NAV_ITEMS, resolveActiveTab } from './navItems'
import './layout.css'

export default function BottomNav({ active }) {
  const navigate = useNavigate()
  const path = usePath()
  const tab = resolveActiveTab(path, active)
  const resolvedActive = tab === 'inventory' ? 'profile' : tab

  return (
    <nav className="bottom-nav" aria-label="Mobile navigation">
      {NAV_ITEMS.map(({ id, label, path: tabPath, Icon }) => {
        const isActive = resolvedActive === id
        return (
          <button
            key={id}
            type="button"
            className={`bottom-nav__item ${isActive ? 'bottom-nav__item--active' : ''}`}
            onClick={() => navigate(tabPath)}
            aria-current={isActive ? 'page' : undefined}
          >
            <Icon size={18} />
            <span>{label}</span>
          </button>
        )
      })}
    </nav>
  )
}
