import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import ProtectedRoute from '../components/ProtectedRoute';
import GuestRoute from '../components/auth/GuestRoute';
import Landing from '../pages/Landing';
import RoleLogin from '../pages/auth/RoleLogin';
import { SchoolPortalAuthRoutes, SchoolPortalAppRoutes } from '@school-portal/routes/SchoolPortalRoutes';
import AdminDashboard from '../pages/AdminDashboard';
import AMDashboard from '../pages/AMDashboard';
import DispatchDashboard from '../pages/DispatchDashboard';
import { ROUTES } from '../utils/routes';

function LegacyAmRedirect() {
  const { pathname } = useLocation();
  const next = pathname.replace(/^\/rm(?=\/|$)/, '/am');
  return <Navigate to={next} replace />;
}

/**
 * Application route tree — shared by the live app and UI catalog previews.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path={ROUTES.home} element={<GuestRoute><Landing /></GuestRoute>} />

      <Route path={ROUTES.login.admin} element={<GuestRoute><RoleLogin expectedRole="Admin" /></GuestRoute>} />
      {SchoolPortalAuthRoutes()}
      <Route path={ROUTES.login.am} element={<GuestRoute><RoleLogin expectedRole="AM" /></GuestRoute>} />
      <Route path={ROUTES.login.dispatch} element={<GuestRoute><RoleLogin expectedRole="Dispatch" /></GuestRoute>} />

      <Route path="/login/rm" element={<Navigate to={ROUTES.login.am} replace />} />
      <Route path="/login" element={<Navigate to={ROUTES.home} replace />} />

      <Route element={<Layout />}>
        <Route
          path="/admin/*"
          element={
            <ProtectedRoute allowedRoles={['Admin']} loginPath={ROUTES.login.admin}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        {SchoolPortalAppRoutes()}
        <Route
          path="/am/*"
          element={
            <ProtectedRoute allowedRoles={['AM']} loginPath={ROUTES.login.am}>
              <AMDashboard />
            </ProtectedRoute>
          }
        />
        <Route path="/rm/*" element={<LegacyAmRedirect />} />
        <Route
          path="/dispatch/*"
          element={
            <ProtectedRoute allowedRoles={['Dispatch', 'Admin']} loginPath={ROUTES.login.dispatch}>
              <DispatchDashboard />
            </ProtectedRoute>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to={ROUTES.home} replace />} />
    </Routes>
  );
}
