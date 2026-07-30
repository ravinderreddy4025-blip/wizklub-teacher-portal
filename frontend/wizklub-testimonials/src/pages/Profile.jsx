import { toast } from 'react-toastify'
import { useAuth } from '../context/AuthContext.jsx'
import AppShell from '../components/layout/AppShell'
import PageHeader from '../components/ui/PageHeader'
import { useNavigate } from '../router'
import '../styles/app.css'
import './pages.css'

export default function Profile() {
  const navigate = useNavigate()
  const { teacher, logout } = useAuth()

  const handleLogout = async () => {
    await logout()
    toast.info('Logged out successfully')
    navigate('/login')
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

        <button type="button" className="btn-outline profile-signout" onClick={handleLogout}>
          Logout
        </button>
      </div>
    </AppShell>
  )
}
