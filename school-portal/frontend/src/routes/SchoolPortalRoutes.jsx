import React from 'react';
import { Route } from 'react-router-dom';
import ProtectedRoute from '@inventory/components/ProtectedRoute';
import GuestRoute from '@inventory/components/auth/GuestRoute';
import SchoolLogin from '../pages/auth/SchoolLogin';
import InstructorSchoolPicker from '../pages/auth/InstructorSchoolPicker';
import SchoolDashboard from '../pages/SchoolDashboard';
import { SCHOOL_ROUTES, ROUTES } from './constants';

/**
 * Public routes (outside app Layout): login + instructor school picker.
 */
export function SchoolPortalAuthRoutes() {
  return (
    <>
      <Route
        path={SCHOOL_ROUTES.login}
        element={(
          <GuestRoute>
            <SchoolLogin />
          </GuestRoute>
        )}
      />
      <Route path={SCHOOL_ROUTES.instructorSelect} element={<InstructorSchoolPicker />} />
    </>
  );
}

/**
 * Protected routes (inside app Layout): school dashboard views.
 */
export function SchoolPortalAppRoutes() {
  return (
    <Route
      path="/school/*"
      element={(
        <ProtectedRoute allowedRoles={['School']} loginPath={ROUTES.login.school}>
          <SchoolDashboard />
        </ProtectedRoute>
      )}
    />
  );
}

export { SCHOOL_ROUTES };
