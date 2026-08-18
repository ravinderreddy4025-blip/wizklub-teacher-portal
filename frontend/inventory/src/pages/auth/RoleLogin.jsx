import React, { useContext, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  Eye,
  EyeOff,
  GraduationCap,
  LayoutGrid,
  Pencil,
} from 'lucide-react';
import { AuthContext } from '../../context/AuthContext';
import Button from '../../components/ui/Button';
import { ROUTES, ROLE_HOME, getPortalByRole } from '../../utils/routes';
import BrandLogo from '../../components/brand/BrandLogo';

const WELCOME_BY_ROLE = {
  Admin: 'Welcome Admin',
  AM: 'Welcome Account Manager',
  School: 'Welcome School',
  Dispatch: 'Welcome Dispatch',
};

const RoleLogin = ({ expectedRole }) => {
  const portal = getPortalByRole(expectedRole);
  const isSchoolPortal = expectedRole === 'School';
  const [loginMode, setLoginMode] = useState('school');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, loginAdmin, loginSchool, loginInstructor, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  if (!portal) return null;

  const isAdminPortal = expectedRole === 'Admin';
  const isInstructorMode = isSchoolPortal && loginMode === 'instructor';
  const usesUsername = isAdminPortal || isInstructorMode;
  const welcomeHeading = WELCOME_BY_ROLE[expectedRole] || 'Welcome back!';

  const identifierLabel = isAdminPortal || isInstructorMode
    ? 'Username'
    : isSchoolPortal
      ? 'School ID'
      : 'Email Address';

  const identifierPlaceholder = isAdminPortal || isInstructorMode
    ? 'Enter your username'
    : isSchoolPortal
      ? 'Enter your school ID'
      : 'Enter your email';

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isInstructorMode) {
        await loginInstructor(identifier, password);
        navigate(ROUTES.login.schoolInstructorSelect);
        return;
      }

      let userData;
      if (isAdminPortal) {
        userData = await loginAdmin(identifier, password);
      } else if (isSchoolPortal) {
        userData = await loginSchool(identifier, password);
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

  const switchMode = (mode) => {
    setLoginMode(mode);
    setIdentifier('');
    setPassword('');
    setError('');
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#FFF8F0]">
      {/* Soft education-icon pattern */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        aria-hidden
        style={{
          backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(
            `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120' fill='none'>
              <g stroke='#F15A24' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'>
                <path d='M18 28h22v16H18z'/><path d='M24 28v-4h10v4'/>
                <path d='M72 22l14 8-14 8-14-8 14-8z'/><path d='M58 38v10'/>
                <circle cx='96' cy='78' r='10'/><path d='M96 72v6l4 2'/>
                <path d='M28 88c0-6 8-10 14-6 6-4 14 0 14 6v10H28V88z'/>
                <path d='M70 95h28'/><path d='M74 90h20v10H74z'/>
              </g>
            </svg>`,
          )}")`,
          backgroundSize: '140px 140px',
        }}
      />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
        <Link
          to={ROUTES.home}
          className="mb-5 inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-[#F15A24] hover:text-[#d94e1c] transition-colors lg:absolute lg:left-10 lg:top-8"
        >
          <ArrowLeft size={16} />
          Back to portals
        </Link>

        <div className="grid flex-1 grid-cols-1 items-stretch gap-6 lg:mt-4 lg:grid-cols-2 lg:gap-8">
          {/* Hero — left on desktop */}
          <section className="relative order-2 overflow-hidden rounded-[1.75rem] bg-gradient-to-b from-[#F15A24] via-[#F7941D] to-[#FBB040] p-8 text-white shadow-[0_20px_50px_rgba(241,90,36,0.28)] sm:p-10 lg:order-1 lg:min-h-[640px] lg:p-12">
            <div
              className="pointer-events-none absolute -right-16 top-20 h-56 w-56 rounded-full border border-white/20"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute -left-10 bottom-24 h-40 w-40 rounded-full border border-white/15"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute inset-0 opacity-20"
              style={{
                backgroundImage: 'radial-gradient(rgba(255,255,255,0.55) 1px, transparent 1px)',
                backgroundSize: '20px 20px',
              }}
              aria-hidden
            />

            <div className="relative z-10 flex h-full min-h-[320px] flex-col justify-between gap-10 lg:min-h-0">
              <div className="max-w-md pt-2 lg:pt-8">
                <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white/95 backdrop-blur-sm">
                  <GraduationCap size={14} />
                  {portal.label} portal
                </p>
                <h1 className="font-heading text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl lg:text-[2.65rem] lg:leading-[1.15]">
                  Launch Your Learning Journey!
                </h1>
                <p className="mt-4 text-sm leading-relaxed text-white/90 sm:text-base">
                  Empowering students for a future-ready world through specialized K-12 programs —
                  and kit inventory that keeps every school supplied.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex items-center gap-2.5 rounded-full bg-black/20 px-3 py-2 backdrop-blur-md">
                  <div className="flex -space-x-2">
                    {['#FFE0C2', '#FFD0A8', '#FFC090'].map((bg, i) => (
                      <span
                        key={bg}
                        className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white/80 text-[10px] font-bold text-[#F15A24]"
                        style={{ backgroundColor: bg, zIndex: 3 - i }}
                      >
                        {['A', 'B', 'C'][i]}
                      </span>
                    ))}
                  </div>
                  <p className="pr-1 text-xs font-semibold text-white sm:text-sm">
                    Loved by 50,000+ students &amp; parents
                  </p>
                </div>
                <div className="hidden items-center gap-3 text-white/80 sm:flex">
                  <BookOpen size={16} />
                  <Pencil size={16} />
                </div>
              </div>
            </div>
          </section>

          {/* Form — right on desktop */}
          <section className="order-1 flex flex-col justify-center rounded-[1.75rem] border border-orange-100/70 bg-white px-6 py-8 shadow-[0_12px_40px_rgba(65,40,10,0.06)] sm:px-10 sm:py-10 lg:order-2 lg:px-12">
            <div className="mx-auto w-full max-w-md animate-fade-in">
              <div className="mb-8 flex flex-col items-center text-center">
                <BrandLogo className="mb-6 h-14 w-auto max-w-[200px]" />
                <h2 className="font-heading text-2xl font-extrabold text-slate-800 sm:text-[1.75rem]">
                  {welcomeHeading}
                </h2>
                <p className="mt-1.5 text-sm text-slate-500">
                  Sign in to continue your journey
                </p>
              </div>

              {isSchoolPortal && (
                <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => switchMode('school')}
                    className={`rounded-lg px-3 py-2.5 text-xs font-bold uppercase tracking-wide transition-all ${
                      loginMode === 'school'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    School ID
                  </button>
                  <button
                    type="button"
                    onClick={() => switchMode('instructor')}
                    className={`rounded-lg px-3 py-2.5 text-xs font-bold uppercase tracking-wide transition-all ${
                      loginMode === 'instructor'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Instructor
                  </button>
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-4">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="login-identifier" className="text-sm font-medium text-slate-600">{identifierLabel}</label>
                  <input
                    id="login-identifier"
                    name="identifier"
                    type={usesUsername || isSchoolPortal ? 'text' : 'email'}
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    required
                    placeholder={identifierPlaceholder}
                    autoComplete={usesUsername || isSchoolPortal ? 'username' : 'email'}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#F15A24] focus:ring-2 focus:ring-[#F15A24]/20"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="login-password" className="text-sm font-medium text-slate-600">Password</label>
                  <div className="relative">
                    <input
                      id="login-password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 pr-12 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#F15A24] focus:ring-2 focus:ring-[#F15A24]/20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:text-[#F15A24]"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <Eye size={18} /> : <EyeOff size={18} />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-start pt-0.5">
                  <button
                    type="button"
                    className="text-sm font-medium text-slate-500 hover:text-[#F15A24] transition-colors"
                    onClick={() => setError('Contact your administrator to reset your password.')}
                  >
                    Forgot Password?
                  </button>
                </div>

                {error && (
                  <div className="rounded-xl border border-error-200 bg-error-50 px-3 py-2.5 text-sm font-medium text-error-700">
                    {error}
                  </div>
                )}

                <Button
                  variant="gradient"
                  type="submit"
                  className="mt-1 w-full rounded-xl py-3.5 text-base font-bold shadow-md shadow-orange-200/80"
                  disabled={loading}
                >
                  {loading ? 'Signing in...' : 'Sign In'}
                </Button>
              </form>

              <div className="mt-8 flex flex-col items-center gap-3 border-t border-slate-100 pt-5">
                <p className="text-center text-xs text-slate-400">
                  {isInstructorMode
                    ? 'Instructor access for school inventory'
                    : `Signing in to the ${portal.label} portal`}
                </p>
                <Link
                  to={ROUTES.home}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-[#F15A24] transition-colors"
                >
                  Switch portal
                  <LayoutGrid size={14} />
                </Link>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default RoleLogin;
