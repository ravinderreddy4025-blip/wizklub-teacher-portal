import { useEffect, useState } from 'react'
import { AlertCircle, Check, Eye, EyeOff } from 'lucide-react'
import { toast } from 'react-toastify'
import { useAuth } from '../context/AuthContext.jsx'
import { assetUrl } from '../lib/assets.js'
import { useNavigate } from '../router'
import './Login.css'

/*
 * student.infinitylearn.com login pattern (same as CS Portal + LMS), in WizKlub colours:
 * orange doodle brand half + white panel with a 40px curved edge, "Welcome" 36/500,
 * 48px outlined floating-label fields, 56px pill submit that stays grey until the form is valid.
 * < 1024px: brand block on top, panel becomes a bottom sheet.
 */
export default function Login() {
  const navigate = useNavigate()
  const { login, isAuthenticated } = useAuth()
  const [userId, setUserId] = useState('')
  const [password, setPassword] = useState('')
  const [keepSignedIn, setKeepSignedIn] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard')
  }, [isAuthenticated, navigate])

  const canSubmit = userId.trim().length > 0 && password.length > 0 && !submitting

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!canSubmit) return
    setError('')
    setSubmitting(true)

    try {
      await login(userId.trim(), password, keepSignedIn)
      toast.success('Logged in successfully')
      navigate('/dashboard')
    } catch (err) {
      setError(err.message || 'Invalid user ID or password.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth">
      <section
        className="auth-brand"
        aria-label="WizKlub Futurz"
        style={{ '--wk-auth-bg': `url("${assetUrl('assets/wiz-auth-bg.svg')}")` }}
      >
        <img
          src={assetUrl('assets/logo-white.png')}
          alt="WizKlub Futurz — An Infinity Learn initiative"
          className="auth-brand__logo"
        />
        <p className="auth-brand__tagline">Teachers Portal</p>
        <p className="auth-brand__sub">
          Upload student testimonials, track coverage and manage school kits — from any device.
        </p>
      </section>

      <section className="auth-panel">
        <form className="auth-col" onSubmit={handleSubmit} noValidate>
          <h1 className="auth-title">Welcome</h1>
          <p className="auth-subtitle">
            Log in with your WizKlub user ID and password
          </p>

          <div className="auth-body">
            {error && (
              <div className="auth-alert" role="alert">
                <AlertCircle size={18} aria-hidden />
                <span>{error}</span>
              </div>
            )}

            <div className={`auth-field ${error ? 'has-error' : ''}`}>
              <div className="auth-field__box">
                <input
                  id="userId"
                  type="text"
                  placeholder=" "
                  value={userId}
                  onChange={(e) => {
                    setUserId(e.target.value)
                    if (error) setError('')
                  }}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  disabled={submitting}
                />
                <label htmlFor="userId">User ID</label>
              </div>
            </div>

            <div className={`auth-field ${error ? 'has-error' : ''}`}>
              <div className="auth-field__box">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder=" "
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    if (error) setError('')
                  }}
                  autoComplete="current-password"
                  disabled={submitting}
                />
                <label htmlFor="password">Password</label>
                <button
                  type="button"
                  className="auth-field__trailing"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={20} aria-hidden /> : <Eye size={20} aria-hidden />}
                </button>
              </div>
            </div>

            <label className="auth-check">
              <input
                type="checkbox"
                checked={keepSignedIn}
                onChange={(e) => setKeepSignedIn(e.target.checked)}
              />
              <span className="auth-check__box" aria-hidden>
                <Check size={12} strokeWidth={3} />
              </span>
              Keep me signed in on this device
            </label>

            <button type="submit" className="auth-submit" disabled={!canSubmit} aria-busy={submitting}>
              {submitting ? (
                <>
                  <span className="auth-submit__spinner" aria-hidden="true" />
                  Logging in…
                </>
              ) : (
                'Login'
              )}
            </button>

            <p className="auth-helper">
              Use the same login as the WizKlub instructor app. Trouble signing in? Contact your WizKlub coordinator.
            </p>
          </div>
        </form>
      </section>
    </div>
  )
}
