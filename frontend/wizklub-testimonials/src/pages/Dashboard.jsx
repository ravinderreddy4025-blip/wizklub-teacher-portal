import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { api } from '../api/client'
import AppShell from '../components/layout/AppShell'
import LoadingScreen from '../components/ui/LoadingScreen'
import StatCard from '../components/ui/StatCard'
import { IconAlert, IconChevronRight, IconFeedback, IconUpload, IconUsers } from '../components/icons/Icons'
import { assetUrl } from '../lib/assets.js'
import { useNavigate } from '../router'
import '../styles/app.css'
import './pages.css'

const schoolImages = [
  assetUrl('assets/school-campus.png'),
  assetUrl('assets/university-library.png'),
  assetUrl('assets/elementary-hallway.png'),
]

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.getDashboard().then((result) => {
      if (!result) {
        setError('Unable to load dashboard.')
        toast.error('Unable to load dashboard')
      } else {
        setData(result)
      }
    })
  }, [])

  if (error) {
    return (
      <AppShell activeTab="home" className="page-home">
        <div className="page empty-state">
          <p className="empty-state__title">Something went wrong</p>
          <p className="empty-state__text">{error}</p>
        </div>
      </AppShell>
    )
  }

  if (!data) {
    return (
      <AppShell activeTab="home" className="page-home">
        <LoadingScreen message="Loading dashboard…" />
      </AppShell>
    )
  }

  const firstName = data.teacher.full_name.split(' ')[0]

  return (
    <AppShell activeTab="home" className="page-home">
      <div className="page page--with-header animate-in">
        <section className="dashboard-hero animate-in-delay-1">
          <h1 className="dashboard-hero__title">{getGreeting()}, {firstName}</h1>
          <p className="dashboard-hero__subtitle">
            Track uploads across your assigned schools and review categories.
          </p>
        </section>

        <section className="summary-grid animate-in-delay-2">
          <StatCard
            label="Total Students"
            value={data.stats.total_students}
            tone="brand"
            icon={IconUsers}
          />
          <StatCard
            label="Testimonials Submitted"
            value={data.stats.testimonials_uploaded}
            tone="blue"
            icon={IconUpload}
          />
          <StatCard
            label="Pending Students"
            value={data.stats.pending_students}
            tone="danger"
            icon={IconAlert}
            hint="No uploads yet"
          />
        </section>

        <section className="schools-section animate-in-delay-3">
          <div className="section-header">
            <h2 className="section-title">Assigned Schools</h2>
            <button type="button" className="link-btn" onClick={() => navigate('/schools')}>
              View all
            </button>
          </div>
          <div className="schools-list">
            {data.schools.map((school, index) => (
              <button
                key={school.id}
                type="button"
                className="school-card card card--interactive"
                onClick={() => navigate(`/schools/${school.id}/batches`)}
              >
                <div className="school-thumb">
                  <img src={schoolImages[index % schoolImages.length]} alt="" />
                </div>
                <div className="school-card__info">
                  <p className="school-card__name">{school.name}</p>
                  <p className="school-card__meta">
                    {school.batch_count} batches · {school.student_count} students
                  </p>
                </div>
                <span className="chevron-btn" aria-hidden="true">
                  <IconChevronRight size={12} />
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="schools-section animate-in-delay-3">
          <div className="section-header">
            <h2 className="section-title">Feedback</h2>
            <button type="button" className="link-btn" onClick={() => navigate('/feedback')}>
              Open
            </button>
          </div>
          <button
            type="button"
            className="school-card card card--interactive"
            onClick={() => navigate('/feedback')}
          >
            <div className="school-thumb" style={{ display: 'grid', placeItems: 'center', color: '#F47A20' }}>
              <IconFeedback size={22} />
            </div>
            <div className="school-card__info">
              <p className="school-card__name">Report an issue</p>
              <p className="school-card__meta">Tech or content problems with screenshots / videos</p>
            </div>
            <span className="chevron-btn" aria-hidden="true">
              <IconChevronRight size={12} />
            </span>
          </button>
        </section>
      </div>
    </AppShell>
  )
}
