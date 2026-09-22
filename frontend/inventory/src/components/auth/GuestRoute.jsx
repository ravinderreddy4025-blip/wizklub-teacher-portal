import React, { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { ROUTES, ROLE_HOME } from '../../utils/routes';

const GuestRoute = ({ children }) => {
  const { user, loading } = useContext(AuthContext);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white" role="status" aria-live="polite">
        <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-wk-peach border-t-wk-orange-text" />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }

  if (user?.role) {
    return <Navigate to={ROLE_HOME[user.role] || ROUTES.home} replace />;
  }

  return children;
};

export default GuestRoute;
