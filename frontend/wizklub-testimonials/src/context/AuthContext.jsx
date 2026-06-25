import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-toastify'
import { api } from '../api/client'
import LoadingScreen from '../components/ui/LoadingScreen'
import { useNavigate, usePath } from '../router'

const AuthContext = createContext(null)
const SESSION_KEY = 'teacher_session'
const SESSION_EXPIRY_KEY = 'teacher_session_expiry'
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

function saveSession(data, keepSignedIn) {
  const payload = JSON.stringify(data)
  localStorage.setItem(SESSION_KEY, payload)

  if (keepSignedIn) {
    localStorage.setItem(
      SESSION_EXPIRY_KEY,
      String(Date.now() + SEVEN_DAYS_MS),
    )
  } else {
    localStorage.removeItem(SESSION_EXPIRY_KEY)
    sessionStorage.setItem(SESSION_KEY, payload)
  }
}

function loadSession() {
  const fromSession = sessionStorage.getItem(SESSION_KEY)
  const fromLocal = localStorage.getItem(SESSION_KEY)
  const raw = fromSession || fromLocal

  if (!raw) return null

  try {
    const parsed = JSON.parse(raw)

    if (!fromSession) {
      const expiry = localStorage.getItem(SESSION_EXPIRY_KEY)
      if (expiry && Date.now() > Number(expiry)) {
        clearSession()
        return null
      }
    }

    return parsed
  } catch {
    clearSession()
    return null
  }
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY)
  localStorage.removeItem(SESSION_EXPIRY_KEY)
  sessionStorage.removeItem(SESSION_KEY)
}

export function AuthProvider({ children }) {
  const [teacher, setTeacher] = useState(null)
  const [loading, setLoading] = useState(true)
  const didRestore = useRef(false)

  useEffect(() => {
    if (didRestore.current) return
    didRestore.current = true

    const saved = loadSession()
    if (saved) {
      api.restoreSession(saved).then((restored) => {
        if (restored) setTeacher(restored)
        else {
          clearSession()
          toast.warning('Session expired. Please log in again.')
        }
        setLoading(false)
      })
      return
    }
    setLoading(false)
  }, [])

  const login = useCallback(async (user_id, password, keepSignedIn = true) => {
    const result = await api.login(user_id, password)
    if (!result.ok) throw new Error(result.error)
    setTeacher(result.teacher)
    saveSession(
      {
        ...result.teacher,
        token: result.token ?? null,
        refresh_token: result.refresh_token ?? null,
      },
      keepSignedIn,
    )
    return result.teacher
  }, [])

  const logout = useCallback(async () => {
    await api.logout()
    setTeacher(null)
    clearSession()
  }, [])

  const value = useMemo(
    () => ({ teacher, loading, login, logout, isAuthenticated: Boolean(teacher) }),
    [teacher, loading, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function RequireAuth({ children }) {
  const { isAuthenticated, loading } = useAuth()
  const navigate = useNavigate()
  const path = usePath()

  useEffect(() => {
    if (!loading && !isAuthenticated && path !== '/login') {
      navigate('/login')
    }
  }, [isAuthenticated, loading, navigate, path])

  if (loading) {
    return <LoadingScreen message="Starting app…" />
  }

  if (!isAuthenticated) return null
  return children
}
