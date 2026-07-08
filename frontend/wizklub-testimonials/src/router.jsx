import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

const RouterContext = createContext(null)

const APP_BASE = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')

function stripAppBase(pathname) {
  if (!APP_BASE) return pathname || '/'
  if (pathname === APP_BASE) return '/'
  if (pathname.startsWith(`${APP_BASE}/`)) {
    return pathname.slice(APP_BASE.length) || '/'
  }
  return pathname || '/'
}

function withAppBase(path) {
  if (!path.startsWith('/')) return path
  return `${APP_BASE}${path}`
}

function splitPathAndSearch(route) {
  const raw = String(route || '/')
  const q = raw.indexOf('?')
  if (q === -1) return { pathname: raw, search: '' }
  return { pathname: raw.slice(0, q) || '/', search: raw.slice(q) }
}

export function matchPath(path, pattern) {
  const pathname = String(path || '/').split('?')[0]
  const patternParts = pattern.split('/').filter(Boolean)
  const pathParts = pathname.split('/').filter(Boolean)
  if (patternParts.length !== pathParts.length) return null

  const params = {}
  for (let i = 0; i < patternParts.length; i += 1) {
    if (patternParts[i].startsWith(':')) {
      params[patternParts[i].slice(1)] = decodeURIComponent(pathParts[i])
    } else if (patternParts[i] !== pathParts[i]) {
      return null
    }
  }

  return params
}

export function Router({ children }) {
  const [path, setPath] = useState(() => {
    const p = stripAppBase(window.location.pathname)
    return p === '/' || p === '' ? '/login' : p
  })

  const navigate = useCallback((next) => {
    const { pathname, search } = splitPathAndSearch(next)
    const resolvedPath = withAppBase(pathname)
    const resolved = `${resolvedPath}${search}`
    const current = `${window.location.pathname}${window.location.search}`
    if (resolved !== current) {
      window.history.pushState({}, '', resolved)
    }
    setPath(stripAppBase(resolvedPath))
  }, [])

  const goBack = useCallback(() => {
    window.history.back()
  }, [])

  useEffect(() => {
    const onPop = () => setPath(stripAppBase(window.location.pathname))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const value = useMemo(() => ({ path, navigate, goBack }), [path, navigate, goBack])

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
}

export function useRouter() {
  const ctx = useContext(RouterContext)
  if (!ctx) throw new Error('useRouter must be used within Router')
  return ctx
}

export function useNavigate() {
  return useRouter().navigate
}

export function usePath() {
  return useRouter().path
}

export function useRouteParams(pattern) {
  const path = usePath()
  return useMemo(() => matchPath(path, pattern), [path, pattern])
}
