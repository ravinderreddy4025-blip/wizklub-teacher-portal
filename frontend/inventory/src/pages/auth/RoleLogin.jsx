import React, { useContext, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Eye, EyeOff, Truck } from 'lucide-react';
import { AuthContext } from '../../context/AuthContext';
import AuthLayout from '../../components/auth/AuthLayout';
import { ROUTES, ROLE_HOME, getPortalByRole } from '../../utils/routes';

/** The Dispatch team has a login route but no ROLE_PORTALS entry (it is hidden from the landing page). */
const DISPATCH_PORTAL = {
  role: 'Dispatch',
  label: 'Dispatch',
  description: 'Ship pending dispatches and keep tracking IDs up to date.',
  icon: Truck,
};

const PORTAL_SUB = {
  Admin: 'Schools, divisions, warehouse stock, replacements and reports — in one place.',
  AM: 'Review your division’s audits and approve replacements for your schools.',
  School: 'Confirm deliveries, submit monthly audits and report kit issues.',
  Dispatch: 'Ship pending dispatches and keep tracking IDs up to date.',
};

const RoleLogin = ({ expectedRole }) => {
  const portal = getPortalByRole(expectedRole) || (expectedRole === 'Dispatch' ? DISPATCH_PORTAL : null);
  const isSchoolPortal = expectedRole === 'School';
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, loginAdmin, loginInstructor, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  if (!portal) return null;

  const isAdminPortal = expectedRole === 'Admin';
  const usesUsername = isAdminPortal || isSchoolPortal;
  const welcomeHeading = 'Welcome';

  const identifierLabel = usesUsername ? 'Username' : 'Email address';

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!identifier.trim() || !password) return;
    setError('');
    setLoading(true);
    try {
      if (isSchoolPortal) {
        await loginInstructor(identifier, password);
        navigate(ROUTES.login.schoolInstructorSelect);
        return;
      }

      let userData;
      if (isAdminPortal) {
        userData = await loginAdmin(identifier, password);
      } else {
        userData = await login(identifier, password);
      }

      if (userData.role !== expectedRole) {
        logout();
        setError(`This account is not authorized for the ${portal.label}. Please use the correct portal.`);
        return;
      }
      navigate(ROLE_HOME[userData.role]);
    } catch (err) {
      const message = typeof err === 'string'
        ? err
        : err?.response?.data?.message || 'Login failed. Please check your credentials.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = identifier.trim().length > 0 && password.length > 0 && !loading;
  const clearError = () => {
    if (error) setError('');
  };

  return (
    <AuthLayout
      tagline="Kit Inventory"
      sub={PORTAL_SUB[expectedRole] || portal.description}
    >
      <Link to={ROUTES.home} className="inv-auth-back">
        <ArrowLeft size={18} aria-hidden />
        All portals
      </Link>

      <form onSubmit={handleLogin}>
        <h1 className="inv-auth-title">{welcomeHeading}</h1>
        <p className="inv-auth-subtitle">
          {isSchoolPortal
            ? 'Log in with your WizKlub instructor (teacher) account'
            : `Log in to the ${portal.label} portal`}
        </p>

        <div className="inv-auth-body">
          {error && (
            <div className="inv-auth-alert" role="alert">
              <AlertCircle size={18} aria-hidden />
              <span>{error}</span>
            </div>
          )}

          <div className={`inv-field ${error ? 'has-error' : ''}`}>
            <div className="inv-field__box">
              <input
                id="login-identifier"
                name="identifier"
                type={usesUsername || isSchoolPortal ? 'text' : 'email'}
                value={identifier}
                onChange={(e) => {
                  setIdentifier(e.target.value);
                  clearError();
                }}
                required
                placeholder=" "
                autoComplete={usesUsername || isSchoolPortal ? 'username' : 'email'}
                autoCapitalize="none"
                spellCheck={false}
                disabled={loading}
              />
              <label htmlFor="login-identifier">{identifierLabel}</label>
            </div>
          </div>

          <div className={`inv-field ${error ? 'has-error' : ''}`}>
            <div className="inv-field__box">
              <input
                id="login-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  clearError();
                }}
                required
                placeholder=" "
                autoComplete="current-password"
                disabled={loading}
              />
              <label htmlFor="login-password">Password</label>
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="inv-field__trailing"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={20} aria-hidden /> : <Eye size={20} aria-hidden />}
              </button>
            </div>
          </div>

          <button
            type="button"
            className="inv-auth-link"
            onClick={() => setError(
              isSchoolPortal
                ? 'Use your WizKlub instructor password, or contact your administrator to reset it.'
                : 'Contact your administrator to reset your password.',
            )}
          >
            Forgot password?
          </button>

          <button type="submit" className="inv-auth-submit" disabled={!canSubmit} aria-busy={loading}>
            {loading ? (
              <>
                <span className="inv-auth-spinner" aria-hidden="true" />
                Signing in…
              </>
            ) : (
              'Login'
            )}
          </button>

          <p className="inv-auth-helper">
            {isSchoolPortal
              ? 'Teachers sign in with their WizKlub instructor account.'
              : `Signing in to the ${portal.label} portal.`}
            {' '}
            <Link to={ROUTES.home} className="font-medium text-wk-orange-text underline-offset-2 hover:underline">
              Switch portal
            </Link>
          </p>
        </div>
      </form>
    </AuthLayout>
  );
};

export default RoleLogin;
