import axios from 'axios'

function normalizeBase(raw) {
  const base = String(raw || '/').trim() || '/'
  return base.endsWith('/') ? base : `${base}/`
}

const appBase = normalizeBase(import.meta.env.BASE_URL || '/')
const inventoryApiBase = String(import.meta.env.VITE_INVENTORY_API_URL || '').trim()
  || (import.meta.env.DEV
    ? 'http://127.0.0.1:5002/api'
    : `${appBase}inventory-api`.replace(/\/{2,}/g, '/'))

const api = axios.create({
  baseURL: inventoryApiBase.replace(/\/$/, ''),
})

api.interceptors.request.use((config) => {
  const userInfo = sessionStorage.getItem('userInfo')
  if (userInfo) {
    try {
      const parsed = JSON.parse(userInfo)
      if (parsed.token) {
        config.headers.Authorization = `Bearer ${parsed.token}`
      }
    } catch {
      // ignore malformed session
    }
  }
  return config
}, (error) => Promise.reject(error))

export default api
export { inventoryApiBase }

export function resolveApiBase() {
  return inventoryApiBase.replace(/\/$/, '')
}
