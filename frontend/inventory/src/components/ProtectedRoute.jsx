import React, { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { ROLE_HOME, ROLE_LOGIN } from '../utils/routes';

const ProtectedRoute = ({ children, allowedRoles, loginPath }) => {
  const { user, loading } = useContext(AuthContext);

  const fallbackLogin = loginPath || (allowedRoles?.[0] ? ROLE_LOGIN[allowedRoles[0]] : '/');

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen app-shell-bg">
        <div className="glass-panel p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary mx-auto" />
        </div>
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
