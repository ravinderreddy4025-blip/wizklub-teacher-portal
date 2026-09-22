import React, { useState, useCallback, useContext, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import Navbar from './Navbar';
import Sidebar from './Sidebar';
import MobileNav from './MobileNav';
import { AuthContext } from '../../context/AuthContext';
import { AmApprovalCountsProvider } from '../../context/AmApprovalCountsContext';
import { AdminApprovalCountsProvider } from '../../context/AdminApprovalCountsContext';
import { ROUTES } from '../../utils/routes';

/*
 * Infinity Learn app shell in WizKlub colours (mirrors the Teachers Portal AppShell):
 *   ≥ 1024: sunset-orange chrome → transparent sidebar (navy ink) → floating white panel (r24)
 *   < 1024: white full-bleed page, sticky top bar, bottom nav + navy drawer.
 */
const COLLAPSE_KEY = 'inv_sidebar_collapsed';

function readCollapsed() {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

const Layout = () => {
  const { user, logout, switchInstructorSchool } = useContext(AuthContext);
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readCollapsed);
  const isAdminShell = user?.role === 'Admin';
  const isStitchShell = user?.role === 'AM' || user?.role === 'School';

  useEffect(() => {
    try {
      window.localStorage.setItem(COLLAPSE_KEY, sidebarCollapsed ? '1' : '0');
    } catch {
      /* storage unavailable — keep in-memory state */
    }
  }, [sidebarCollapsed]);

  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), []);
  const openMobileMenu = useCallback(() => setMobileMenuOpen(true), []);

  const handleLogout = useCallback(async () => {
    await logout();
    navigate(ROUTES.home);
  }, [logout, navigate]);

  const handleSwitchSchool = useCallback(() => {
    switchInstructorSchool();
    navigate(ROUTES.login.schoolInstructorSelect);
  }, [switchInstructorSchool, navigate]);

  return (
    <AmApprovalCountsProvider>
    <AdminApprovalCountsProvider>
    <div
      className={`inv-shell dashboard-shell ${isAdminShell ? 'command-shell' : ''} ${isStitchShell ? 'stitch-shell' : ''}`}
    >
      <Sidebar
        collapsed={sidebarCollapsed}
        mobileOpen={mobileMenuOpen}
        onMobileClose={closeMobileMenu}
        onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
        onLogout={handleLogout}
      />
      <div className="inv-shell__frame">
        <div className="inv-shell__main">
          <Navbar
            onOpenMobileMenu={openMobileMenu}
            onLogout={handleLogout}
            onSwitchSchool={handleSwitchSchool}
          />
          <main className="inv-shell__content animate-fade-in">
            <div className="inv-shell__page">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
      <MobileNav onOpenMoreMenu={openMobileMenu} />
    </div>
    </AdminApprovalCountsProvider>
    </AmApprovalCountsProvider>
  );
};

export default Layout;
