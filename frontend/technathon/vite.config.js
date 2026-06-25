import path from 'path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Subpath deploy (unified gateway): VITE_APP_BASE_PATH=/technathon/ — default / for local root hosting.
function normalizeAppBase(raw) {
  const s = String(raw || '/').trim() || '/'
  if (s === '/') return '/'
  return s.endsWith('/') ? s : `${s}/`
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, '../..'), '')
  const base = normalizeAppBase(env.VITE_APP_BASE_PATH || '/')
  const baseNoSlash = base.replace(/\/+$/, '') || ''

  const proxy = {}
  if (baseNoSlash) {
    proxy[`${baseNoSlash}/api`] = {
      target: 'http://127.0.0.1:5000',
      changeOrigin: true,
      rewrite: (p) => (p.startsWith(baseNoSlash) ? p.slice(baseNoSlash.length) : p),
    }
  } else {
    proxy['/api'] = {
      target: 'http://127.0.0.1:5000',
      changeOrigin: true,
      timeout: 900000,
      proxyTimeout: 900000,
    }
  }

  return {
    base,
    envDir: path.resolve(__dirname, '../..'),
    plugins: [react()],
    server: {
      proxy,
    },
  }
})
