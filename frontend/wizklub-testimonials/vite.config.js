import path from 'path'
import { createRequire } from 'module'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const require = createRequire(import.meta.url)
const repoRoot = path.resolve(import.meta.dirname, '../..')
const inventoryFrontendRoot = path.join(repoRoot, 'frontend/inventory')
const schoolPortalRoot = path.join(repoRoot, 'school-portal/frontend/src')
const inventoryPkg = require(path.join(inventoryFrontendRoot, 'package.json'))

const inventoryDependencyAliases = Object.keys(inventoryPkg.dependencies || {}).reduce((acc, dep) => {
  acc[dep] = path.join(inventoryFrontendRoot, 'node_modules', dep)
  return acc
}, {})

function normalizeAppBase(raw) {
  const s = String(raw || '/').trim() || '/'
  if (s === '/') return '/'
  return s.endsWith('/') ? s : `${s}/`
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, '')
  const base = normalizeAppBase(env.VITE_APP_BASE_PATH || '/')
  const baseNoSlash = base.replace(/\/+$/, '') || ''

  const proxy = {}
  if (baseNoSlash) {
    proxy[`${baseNoSlash}/api`] = {
      target: 'http://127.0.0.1:3001',
      changeOrigin: true,
      rewrite: (p) => (p.startsWith(baseNoSlash) ? p.slice(baseNoSlash.length) : p),
    }
    proxy[`${baseNoSlash}/inventory-api`] = {
      target: 'http://127.0.0.1:5002',
      changeOrigin: true,
      rewrite: (p) => {
        const stripped = p.startsWith(baseNoSlash) ? p.slice(baseNoSlash.length) : p
        return stripped.replace(/^\/inventory-api/, '/api')
      },
    }
    proxy[`${baseNoSlash}/uploads`] = {
      target: 'http://127.0.0.1:5002',
      changeOrigin: true,
      rewrite: (p) => (p.startsWith(baseNoSlash) ? p.slice(baseNoSlash.length) : p),
    }
  } else {
    proxy['/api'] = { target: 'http://127.0.0.1:3001', changeOrigin: true }
    proxy['/inventory-api'] = {
      target: 'http://127.0.0.1:5002',
      changeOrigin: true,
      rewrite: (p) => p.replace(/^\/inventory-api/, '/api'),
    }
    proxy['/uploads'] = { target: 'http://127.0.0.1:5002', changeOrigin: true }
  }

  return {
    base,
    envDir: repoRoot,
    resolve: {
      alias: {
        // More specific alias must come before `@inventory` prefix match.
        '@inventory/utils/api': path.resolve(import.meta.dirname, 'src/inventory/inventoryApi.js'),
        '@inventory': path.join(inventoryFrontendRoot, 'src'),
        '@school-portal': schoolPortalRoot,
        ...inventoryDependencyAliases,
      },
      dedupe: ['react', 'react-dom', 'react-router-dom'],
    },
    server: {
      host: true,
      fs: {
        allow: [repoRoot],
      },
      allowedHosts: ['.ngrok-free.app', '.ngrok.io', '.ngrok.app'],
      proxy,
    },
    preview: {
      host: true,
      port: 4173,
      proxy,
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'prompt',
        injectRegister: null,
        includeAssets: ['favicon.svg', 'icons.svg'],
        manifest: {
          id: base,
          name: 'WizKlub Teachers Portal',
          short_name: 'Teachers Portal',
          description: 'Teacher portal for school review media, analytics, and inventory',
          theme_color: '#F97316',
          background_color: '#fcf9f8',
          display: 'standalone',
          display_override: ['standalone', 'browser'],
          orientation: 'any',
          scope: base,
          start_url: base,
          categories: ['education', 'productivity'],
          icons: [
            {
              src: `${base}assets/logo.png`,
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,webmanifest}'],
          navigateFallback: `${base}index.html`,
          navigateFallbackDenylist: [/\/api\//, /\/inventory-api\//, /\/uploads\//, /\/health(?:\/|$)/],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: false,
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-stylesheets',
                expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-webfonts',
                expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              },
            },
            {
              urlPattern: /^https:\/\/storage\.googleapis\.com\/.*/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'gcs-media',
                networkTimeoutSeconds: 10,
                expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 7 },
              },
            },
            {
              urlPattern: /^https:\/\/api\.wizklub\.com\/.*/i,
              handler: 'NetworkOnly',
            },
            {
              urlPattern: /\/api\//,
              handler: 'NetworkOnly',
            },
            {
              urlPattern: /\/inventory-api\//,
              handler: 'NetworkOnly',
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
          navigateFallback: `${base}index.html`,
        },
      }),
    ],
  }
})
