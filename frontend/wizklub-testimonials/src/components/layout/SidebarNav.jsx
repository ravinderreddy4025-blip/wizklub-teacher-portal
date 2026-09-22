import { LogOut, PanelLeft } from 'lucide-react'
import { assetUrl } from '../../lib/assets.js'
import { useNavigate, usePath } from '../../router'
import { NAV_GROUPS, resolveActiveTab } from './navItems'
import './layout.css'

/*
 * Sidebar: white text on the solid orange frame (Headspace style), labelled groups,
 * collapses to the student-app icon rail (labels become tooltips).
 */
export default function SidebarNav({ active, collapsed, onToggle, onLogout }) {
  const navigate = useNavigate()
  const path = usePath()
  const resolvedActive = resolveActiveTab(path, active)

  return (
    <aside
      className={`sidebar-nav ${collapsed ? 'sidebar-nav--collapsed' : ''}`}
      aria-label="Main navigation"
    >
      <div className="sidebar-nav__brand">
        <button
          type="button"
          className="sidebar-nav__logo-btn"
          onClick={() => navigate('/dashboard')}
          aria-label="WizKlub Teachers Portal — home"
        >
          <img src={assetUrl('assets/logo-white.png')} alt="" className="sidebar-nav__logo" />
        </button>
        <button
          type="button"
          className="sidebar-nav__icon-btn"
          onClick={onToggle}
          aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
          title={collapsed ? 'Expand menu' : 'Collapse menu'}
        >
          <PanelLeft size={18} aria-hidden />
        </button>
      </div>

      {!collapsed && <p className="sidebar-nav__product">Teachers Portal</p>}

      <nav className="sidebar-nav__groups">
        {NAV_GROUPS.map((group, index) => (
          <div key={group.label} className="sidebar-nav__group">
            {collapsed ? (
              index > 0 && <span className="sidebar-nav__divider" aria-hidden />
            ) : (
              <p className="sidebar-nav__group-label">{group.label}</p>
            )}
            {group.items.map(({ id, label, path: tabPath, Icon }) => {
              const isActive = resolvedActive === id
              return (
                <button
                  key={id}
                  type="button"
                  className={`sidebar-nav__item ${isActive ? 'sidebar-nav__item--active' : ''}`}
                  onClick={() => navigate(tabPath)}
                  title={collapsed ? label : undefined}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon size={18} />
                  {collapsed ? <span className="sr-only">{label}</span> : <span>{label}</span>}
                </button>
              )
            })}
          </div>
        ))}
      </nav>

      <button
        type="button"
        className="sidebar-nav__item sidebar-nav__logout"
        onClick={onLogout}
        title={collapsed ? 'Log out' : undefined}
      >
        <LogOut size={18} aria-hidden />
        {collapsed ? <span className="sr-only">Log out</span> : <span>Log out</span>}
      </button>
    </aside>
  )
}
