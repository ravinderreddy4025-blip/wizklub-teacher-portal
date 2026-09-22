import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { useAuth } from '../../context/AuthContext.jsx'
import { useNavigate } from '../../router'
import BottomNav from './BottomNav'
import Fab from './Fab'
import SidebarNav from './SidebarNav'
import TopBar from './TopBar'
import './layout.css'

/*
 * Infinity Learn layout (student portal · LMS · CS Portal) in WizKlub colours:
 *   WizKlub sunset-orange chrome → transparent sidebar (navy ink) → floating white panel (24px radius).
 * < 1024px the panel goes full-bleed with a white top bar and the bottom nav.
 */
const COLLAPSE_KEY = 'wk_sidebar_collapsed'

function readCollapsed() {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

export default function AppShell({
  children,
  showTopBar = true,
  showBottomNav = true,
  showFab = false,
  fabIcon = 'camera',
  activeTab,
  topBarVariant,
  showRefresh = false,
  showMore = false,
  showBell = false,
  onBack,
  onFabClick,
  className = '',
}) {
  const { teacher, logout } = useAuth()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(readCollapsed)

  useEffect(() => {
    try {
      window.localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0')
    } catch {
      /* storage unavailable — keep in-memory state */
    }
  }, [collapsed])

  const handleLogout = async () => {
    await logout()
    toast.info('Logged out successfully')
    navigate('/login')
  }

  return (
    <div className={`app-shell ${collapsed ? 'app-shell--collapsed' : ''} ${className}`}>
      <SidebarNav
        active={activeTab}
        collapsed={collapsed}
        onToggle={() => setCollapsed((v) => !v)}
        onLogout={handleLogout}
      />

      <div className="app-shell__frame">
        <div className="app-shell__main">
          {showTopBar && (
            <TopBar
              variant={topBarVariant}
              showRefresh={showRefresh}
              showMore={showMore}
              showBell={showBell}
              onBack={onBack}
              teacher={teacher}
              onLogout={handleLogout}
            />
          )}
          <main className="app-shell__content">
            <div className="page-container">{children}</div>
          </main>
        </div>
      </div>

      {showFab && <Fab icon={fabIcon} onClick={onFabClick} />}
      {showBottomNav && <BottomNav active={activeTab} />}
    </div>
  )
}
