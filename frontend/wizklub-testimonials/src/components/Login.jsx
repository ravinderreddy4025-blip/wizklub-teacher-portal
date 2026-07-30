import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { useAuth } from '../context/AuthContext.jsx'
import { assetUrl } from '../lib/assets.js'
import { useNavigate } from '../router'
import './Login.css'

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

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      await login(userId.trim(), password, keepSignedIn)
      toast.success('Logged in successfully')
      navigate('/dashboard')
    } catch (err) {
      const msg = err.message || 'Invalid user ID or password.'
      setError(msg)
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login animate-in">
      <aside className="login__aside">
        <div className="login__aside-content">
          <img src={assetUrl('assets/logo.png')} alt="" className="login__aside-logo" />
          <h1 className="login__aside-title">Wizklub Teacher Upload</h1>
          <p className="login__aside-text">
            Manage student review media across schools, batches, and five review categories — from any browser.
          </p>
          <ul className="login__features">
            <li>Dashboard with upload workload stats</li>
            <li>School → batch → student drill-down</li>
            <li>Photo and video uploads by category</li>
          </ul>
        </div>
      </aside>

      <div className="login__panel">
        <main className="login__main">
          <div className="login__container">
            <header className="login__header">
              <div className="login__brand login__brand--mobile">
                <div className="login__logo-wrap">
                  <div className="login__logo">
                    <img src={assetUrl('assets/logo.png')} alt="Wizklub Teacher Upload" className="login__logo-img" />
                  </div>
                </div>
                <h2 className="login__title">Sign in</h2>
                <p className="login__tagline">Access your teacher upload dashboard</p>
              </div>
            </header>

            <div className="login__form-card">
              <form className="login__form" onSubmit={handleSubmit}>
                {error && <p className="login__error">{error}</p>}

                <div className="login__field">
                  <label className="login__label" htmlFor="userId">User ID</label>
                  <input
                    id="userId"
                    type="text"
                    className="login__input"
                    placeholder="priya.sharma"
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    autoComplete="username"
                    required
                    disabled={submitting}
                  />
                </div>

                <div className="login__field">
                  <label className="login__label" htmlFor="password">Password</label>
                  <div className="login__password-wrap">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      className="login__input login__input--password"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      required
                      disabled={submitting}
                    />
                    <button
                      type="button"
                      className="login__toggle-password"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </svg>
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                <div className="login__remember">
                  <label className="login__toggle-label">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={keepSignedIn}
                      className={`login__toggle ${keepSignedIn ? 'login__toggle--on' : ''}`}
                      onClick={() => setKeepSignedIn((v) => !v)}
                    >
                      <span className="login__toggle-track" />
                      <span className="login__toggle-knob" />
                    </button>
                    <span className="login__toggle-text">Keep me signed in</span>
                  </label>
                </div>

                <button
                  type="submit"
                  className={`login__submit ${submitting ? 'login__submit--loading' : ''}`}
                  disabled={submitting}
                  aria-busy={submitting}
                >
                  {submitting ? (
                    <>
                      <span className="login__submit-spinner" aria-hidden="true" />
                      <span>Logging in…</span>
                    </>
                  ) : (
                    'Log in'
                  )}
                </button>
              </form>

            </div>

            <div className="login__support">
              <p className="login__support-text">
                Need help? <a href="#" className="login__support-link">Contact Support</a>
              </p>
            </div>
          </div>
        </main>

        <footer className="login__footer">
          <p className="login__copyright">© 2026 Wizklub Teacher Upload</p>
        </footer>
      </div>
    </div>
  )
}
