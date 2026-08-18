import { useMemo } from 'react'
import { toast } from 'react-toastify'
import { useAuth } from '../context/AuthContext.jsx'
import AppShell from '../components/layout/AppShell'
import PageHeader from '../components/ui/PageHeader'
import { IconChevronRight, IconInventory } from '../components/icons/Icons'
import { useNavigate } from '../router'
import '../styles/app.css'
import './pages.css'

function readInventorySession() {
  try {
    const raw = sessionStorage.getItem('userInfo')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.role === 'School' ? parsed : null
  } catch {
    return null
  }
}

export default function Profile() {
  const navigate = useNavigate()
  const { teacher, logout } = useAuth()
  const inventorySession = useMemo(() => readInventorySession(), [])

  const handleLogout = async () => {
    await logout()
    toast.info('Logged out successfully')
    navigate('/login')
  }

  const handleOpenInventory = () => {
    navigate('/inventory')
  }

  return (
    <AppShell topBarVariant="back" showBell activeTab="profile" className="page-profile">
      <div className="page animate-in">
        <PageHeader
          eyebrow="Account"
          title="Profile"
          subtitle="Your teacher account details."
        />

        <div className="profile-user card">
          <div className="profile-user__avatar">👨‍🏫</div>
          <div>
            <h2 className="profile-user__name">{teacher?.full_name}</h2>
            <p className="page__subtitle">{teacher?.user_id}</p>
          </div>
        </div>

        <button
          type="button"
          className="profile-inventory card"
          onClick={handleOpenInventory}
        >
          <span className="profile-inventory__icon" aria-hidden>
            <IconInventory size={22} />
          </span>
          <span className="profile-inventory__body">
            <span className="profile-inventory__title">School kit inventory</span>
            <span className="profile-inventory__hint">
              {inventorySession
                ? `Continue for ${inventorySession.name || inventorySession.schoolCode || 'your school'} — dispatches, audits, and replacements.`
                : 'Confirm dispatches, submit monthly audits, and request kit replacements.'}
            </span>
          </span>
          <IconChevronRight className="profile-inventory__chev" size={18} />
        </button>

        <button type="button" className="btn-outline profile-signout" onClick={handleLogout}>
          Logout
        </button>
      </div>
    </AppShell>
  )
}
