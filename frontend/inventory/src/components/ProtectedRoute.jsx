import React, { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { ROLE_HOME, ROLE_LOGIN } from '../utils/routes';

const ProtectedRoute = ({ children, allowedRoles, loginPath }) => {
  const { user, loading } = useContext(AuthContext);

  const fallbackLogin = loginPath || (allowedRoles?.[0] ? ROLE_LOGIN[allowedRoles[0]] : '/');

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white" role="status" aria-live="polite">
        <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-wk-peach border-t-wk-orange-text" />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to={fallbackLogin} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    const home = ROLE_HOME[user.role] || '/';
    return <Navigate to={home} replace />;
  }

  if (allowedRoles?.includes('Admin') && user.role === 'Admin' && user.loginType !== 'wizklub') {
    return <Navigate to={fallbackLogin} replace />;
  }

  return children;
};

export default ProtectedRoute;
