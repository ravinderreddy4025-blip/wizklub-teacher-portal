import { assetUrl } from '../../lib/assets.js'
import { useNavigate, usePath } from '../../router'
import { NAV_ITEMS, resolveActiveTab } from './navItems'
import './layout.css'

export default function SidebarNav({ active }) {
  const navigate = useNavigate()
  const path = usePath()
  const resolvedActive = resolveActiveTab(path, active)

  return (
    <aside className="sidebar-nav" aria-label="Main navigation">
      <div className="sidebar-nav__brand">
        <img src={assetUrl('assets/logo.png')} alt="" className="sidebar-nav__logo" />
        <div>
          <p className="sidebar-nav__title">WizKlub</p>
          <p className="sidebar-nav__subtitle">Teachers Portal</p>
        </div>
      </div>

      <nav className="sidebar-nav__links">
        {NAV_ITEMS.map(({ id, label, path: tabPath, Icon }) => {
          const isActive = resolvedActive === id
          return (
            <button
              key={id}
              type="button"
              className={`sidebar-nav__item ${isActive ? 'sidebar-nav__item--active' : ''}`}
              onClick={() => navigate(tabPath)}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
