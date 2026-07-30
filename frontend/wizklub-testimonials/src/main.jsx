import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { toast } from 'react-toastify'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { initPwa } from './pwa/register.js'
import './index.css'

function OnlineStatus() {
  useEffect(() => {
    initPwa({
      onNeedRefresh() {
        toast.info('A new version is available. Tap to refresh.', {
          toastId: 'pwa-update',
          autoClose: false,
          closeOnClick: true,
          onClick: () => window.location.reload(),
        })
      },
      onOfflineReady() {
        toast.success('App is ready to work offline.', {
          toastId: 'pwa-offline-ready',
          autoClose: 2500,
        })
      },
    })
  }, [])

  useEffect(() => {
    const onOffline = () => {
      toast.warning('You are offline. Uploads and sync need an internet connection.', {
        toastId: 'offline',
        autoClose: false,
      })
    }
    const onOnline = () => {
      toast.dismiss('offline')
      toast.success('Back online.', { autoClose: 2000 })
    }

    window.addEventListener('offline', onOffline)
    window.addEventListener('online', onOnline)
    return () => {
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online', onOnline)
    }
  }, [])

  return null
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <OnlineStatus />
      <App />
    </AuthProvider>
  </StrictMode>,
)
