import { useNavigate, usePath } from '../../router'
import { NAV_ITEMS, resolveActiveTab } from './navItems'
import './layout.css'

export default function BottomNav({ active }) {
  const navigate = useNavigate()
  const path = usePath()
  const resolvedActive = resolveActiveTab(path, active)

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
          >
            <Icon size={18} />
            <span>{label}</span>
          </button>
        )
      })}
    </nav>
  )
}
