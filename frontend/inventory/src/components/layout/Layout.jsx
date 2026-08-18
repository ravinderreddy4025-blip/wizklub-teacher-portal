import React, { useState, useCallback, useContext } from 'react';
import Navbar from './Navbar';
import Sidebar from './Sidebar';
import MobileNav from './MobileNav';
import { Outlet } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { AmApprovalCountsProvider } from '../../context/AmApprovalCountsContext';
import { AdminApprovalCountsProvider } from '../../context/AdminApprovalCountsContext';

const Layout = () => {
  const { user } = useContext(AuthContext);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const isAdminShell = user?.role === 'Admin';
  const isStitchShell = user?.role === 'AM' || user?.role === 'School';

  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), []);
  const openMobileMenu = useCallback(() => setMobileMenuOpen(true), []);

  return (
    <AmApprovalCountsProvider>
    <AdminApprovalCountsProvider>
    <div
      className={`dashboard-shell flex h-screen max-h-screen font-body overflow-hidden ${
        isAdminShell ? 'command-shell' : ''
      } ${isStitchShell ? 'stitch-shell' : ''}`}
    >
      <div className="relative z-20 flex-shrink-0 h-screen">
        <Sidebar
          collapsed={sidebarCollapsed}
          mobileOpen={mobileMenuOpen}
          onMobileClose={closeMobileMenu}
          onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
        />
      </div>
      <div className="relative z-10 flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden w-full">
        <Navbar onOpenMobileMenu={openMobileMenu} />
        <main
          className={`flex-1 min-h-0 overflow-y-auto p-3 md:p-5 pb-20 md:pb-6 animate-fade-in ${
            isAdminShell ? 'bg-white' : 'bg-[var(--stitch-canvas)]'
          }`}
        >
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
        <MobileNav onOpenMoreMenu={openMobileMenu} />
      </div>
    </div>
    </AdminApprovalCountsProvider>
    </AmApprovalCountsProvider>
  );
};

export default Layout;
