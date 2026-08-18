import React, { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { ROUTES, ROLE_HOME } from '../../utils/routes';

const GuestRoute = ({ children }) => {
  const { user, loading } = useContext(AuthContext);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen app-shell-bg">
        <div className="glass-panel p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary mx-auto" />
        </div>
      </div>
    );
  }

  if (user?.role) {
    return <Navigate to={ROLE_HOME[user.role] || ROUTES.home} replace />;
  }

  return children;
};

export default GuestRoute;
