import path from 'path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

function normalizeAppBase(raw) {
  const s = String(raw || '/').trim() || '/'
  if (s === '/') return '/'
  return s.endsWith('/') ? s : `${s}/`
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, '../..'), '')
  const base = normalizeAppBase(env.VITE_APP_BASE_PATH || '/')
  const baseNoSlash = base.replace(/\/+$/, '') || ''

  const proxy = {}
  if (baseNoSlash) {
    proxy[`${baseNoSlash}/api`] = {
      target: 'http://127.0.0.1:3001',
      changeOrigin: true,
      rewrite: (p) => (p.startsWith(baseNoSlash) ? p.slice(baseNoSlash.length) : p),
    }
    proxy[`${baseNoSlash}/uploads`] = {
      target: 'http://127.0.0.1:3001',
      changeOrigin: true,
      rewrite: (p) => (p.startsWith(baseNoSlash) ? p.slice(baseNoSlash.length) : p),
    }
  } else {
    proxy['/api'] = { target: 'http://127.0.0.1:3001', changeOrigin: true }
    proxy['/uploads'] = { target: 'http://127.0.0.1:3001', changeOrigin: true }
  }

  return {
    base,
    envDir: path.resolve(__dirname, '../..'),
    server: {
      host: true,
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
          name: 'Wizklub Teacher Upload',
          short_name: 'WizKlub',
          description: 'Teacher media upload dashboard for school review categories',
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
          navigateFallbackDenylist: [/\/api\//, /\/uploads\//, /\/health(?:\/|$)/],
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
