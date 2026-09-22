import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { toast } from 'react-toastify'
import { initInstallPrompt } from '../pwa/install.js'
import { initPwa, refreshPwa } from '../pwa/register.js'
import '../components/PwaInstallBanner.css'

const LATER_KEY = 'pwa_update_later'

function readLater() {
  try {
    return window.sessionStorage.getItem(LATER_KEY) === '1'
  } catch {
    return false
  }
}

// Lives outside main.jsx so Fast Refresh never re-executes the entry (double createRoot).
export default function OnlineStatus() {
  const [updateReady, setUpdateReady] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [later, setLater] = useState(readLater)

  useEffect(() => {
    initInstallPrompt()
    initPwa({
      onNeedRefresh() {
        setUpdateReady(true)
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

  if (!updateReady || later) return null

  // refreshPwa() tells the waiting service worker to take over, then reloads —
  // a plain reload() leaves it waiting, which is why the old toast came back on every visit.
  const handleUpdate = () => {
    setUpdating(true)
    refreshPwa()
  }

  const handleLater = () => {
    try {
      window.sessionStorage.setItem(LATER_KEY, '1')
    } catch {
      /* ignore */
    }
    setLater(true)
  }

  return (
    <div className="pwa-update" role="status" aria-live="polite">
      <Sparkles size={18} className="pwa-update__icon" aria-hidden />
      <p className="pwa-update__text">New version ready</p>
      <button type="button" className="pwa-update__later" onClick={handleLater}>
        Later
      </button>
      <button type="button" className="pwa-update__btn" onClick={handleUpdate} disabled={updating}>
        {updating ? 'Updating…' : 'Update'}
      </button>
    </div>
  )
}
