import path from 'path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const repoRoot = path.resolve(import.meta.dirname, '../..')
const frontendRoot = path.resolve(import.meta.dirname)
const pkg = require('./package.json')

const dependencyAliases = Object.keys(pkg.dependencies || {}).reduce((acc, dep) => {
  acc[dep] = path.join(frontendRoot, 'node_modules', dep)
  return acc
}, {})

function normalizeAppBase(raw) {
  const s = String(raw || '/').trim() || '/'
  if (s === '/') return '/'
  return s.endsWith('/') ? s : `${s}/`
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, '')
  const base = normalizeAppBase(env.VITE_INVENTORY_BASE_PATH || '/inventory/')
  const baseNoSlash = base.replace(/\/+$/, '') || ''

  const proxy = {}
  if (baseNoSlash) {
    proxy[`${baseNoSlash}/api`] = {
      target: 'http://127.0.0.1:5002',
      changeOrigin: true,
      rewrite: (p) => (p.startsWith(baseNoSlash) ? p.slice(baseNoSlash.length) : p),
    }
    proxy[`${baseNoSlash}/uploads`] = {
      target: 'http://127.0.0.1:5002',
      changeOrigin: true,
      rewrite: (p) => (p.startsWith(baseNoSlash) ? p.slice(baseNoSlash.length) : p),
    }
  } else {
    proxy['/api'] = { target: 'http://127.0.0.1:5002', changeOrigin: true }
    proxy['/uploads'] = { target: 'http://127.0.0.1:5002', changeOrigin: true }
  }

  return {
    base,
    envDir: repoRoot,
    resolve: {
      alias: {
        '@inventory': path.join(frontendRoot, 'src'),
        '@school-portal': path.join(repoRoot, 'school-portal/frontend/src'),
        ...dependencyAliases,
      },
      dedupe: ['react', 'react-dom', 'react-router-dom'],
    },
    server: {
      fs: {
        allow: [repoRoot],
      },
      proxy,
    },
    preview: {
      proxy,
    },
    plugins: [react()],
  }
})
