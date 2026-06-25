import BottomNav from './BottomNav'
import Fab from './Fab'
import SidebarNav from './SidebarNav'
import TopBar from './TopBar'
import './layout.css'

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
  return (
    <div className={`app-shell ${className}`}>
      <SidebarNav active={activeTab} />

      <div className="app-shell__main">
        {showTopBar && (
          <TopBar
            variant={topBarVariant}
            showRefresh={showRefresh}
            showMore={showMore}
            showBell={showBell}
            onBack={onBack}
          />
        )}
        <main className="app-shell__content">
          <div className="page-container">{children}</div>
        </main>
      </div>

      {showFab && <Fab icon={fabIcon} onClick={onFabClick} />}
      {showBottomNav && <BottomNav active={activeTab} />}
    </div>
  )
}
