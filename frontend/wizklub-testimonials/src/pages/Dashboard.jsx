import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { ArrowRight, BarChart3, Building2, CheckCircle2, Clock3, LifeBuoy, Package, Play, School, Users } from 'lucide-react'
import { api } from '../api/client'
import AppShell from '../components/layout/AppShell'
import AttentionCard from '../components/health/AttentionCard'
import StatCard from '../components/ui/StatCard'
import { useNavigate } from '../router'
import '../styles/app.css'
import './pages.css'

// IL subject-tile pastels (bg = ramp-95, icon = ramp-40) cycled across schools.
const SCHOOL_TONES = ['blue', 'orange', 'green', 'purple', 'gold']

const QUICK_LINKS = [
  { id: 'start-class', label: 'Start class', hint: 'Get the code for the board', path: '/schools', Icon: Play, tone: 'gold' },
  { id: 'schools', label: 'Schools & batches', hint: 'Upload student media', path: '/schools', Icon: School, tone: 'blue' },
  { id: 'analytics', label: 'Analytics', hint: 'Coverage by school', path: '/analytics', Icon: BarChart3, tone: 'purple' },
  { id: 'inventory', label: 'Kit inventory', hint: 'Dispatches & audits', path: '/inventory', Icon: Package, tone: 'orange' },
  { id: 'support', label: 'Support', hint: 'Report an issue', path: '/feedback', Icon: LifeBuoy, tone: 'green' },
]

function formatToday() {
  return new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })
}

function DashboardSkeleton() {
  return (
    <div className="dash" aria-busy="true" aria-label="Loading dashboard">
      <div className="skeleton skeleton--title" />
      <div className="skeleton skeleton--hero" />
      <div className="dash-kpis">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton skeleton--kpi" />
        ))}
      </div>
    </div>
  )
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
          <button type="button" className="btn-primary dash-retry" onClick={() => window.location.reload()}>
            Try again
          </button>
        </div>
      </AppShell>
    )
  }

  if (!data) {
    return (
      <AppShell activeTab="home" className="page-home">
        <DashboardSkeleton />
      </AppShell>
    )
  }

  const total = Number(data.stats?.total_students) || 0
  const uploaded = Number(data.stats?.testimonials_uploaded ?? data.stats?.videos_uploaded) || 0
  // Same definition as the API (total − students with an upload), so the banner and KPIs always agree.
  const pending = Math.max(total - uploaded, 0)
  const coverage = total > 0 ? Math.round((uploaded / total) * 100) : 0
  const schools = data.schools || []
  const firstSchool = schools[0]

  return (
    <AppShell activeTab="home" className="page-home">
      <div className="dash animate-in">
        <header className="dash-head">
          <div>
            <h1 className="dash-head__title">Dashboard</h1>
            <p className="dash-head__sub">
              {formatToday()} · Track uploads across your assigned schools
            </p>
          </div>
        </header>

        <div className="dash-top animate-in-delay-1">
          <section className="dash-hero" aria-labelledby="dash-hero-title">
            <div className="dash-hero__body">
              <p className="dash-hero__eyebrow">Testimonial coverage</p>
              <h2 id="dash-hero-title" className="dash-hero__title">
                {total === 0
                  ? 'No students assigned yet'
                  : pending === 0
                    ? 'Every student has a testimonial 🎉'
                    : `${pending} student${pending === 1 ? '' : 's'} still need a testimonial`}
              </h2>
              <div
                className="dash-hero__meter"
                role="progressbar"
                aria-valuenow={coverage}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Students with at least one upload"
              >
                <span style={{ width: `${coverage}%` }} />
              </div>
              <p className="dash-hero__meta">
                <strong>{coverage}%</strong> covered · {uploaded} of {total} students have at least one upload
              </p>
            </div>
            <button
              type="button"
              className="dash-hero__cta"
              onClick={() => navigate(firstSchool && schools.length === 1 ? `/schools/${firstSchool.id}/batches` : '/schools')}
            >
              Continue uploads <ArrowRight size={18} aria-hidden />
            </button>
          </section>

          <button type="button" className="dash-help" onClick={() => navigate('/feedback/new')}>
            <span className="dash-help__icon" aria-hidden>
              <LifeBuoy size={22} />
            </span>
            <span className="dash-help__title">Facing a tech or content issue?</span>
            <span className="dash-help__text">
              Send it to the WizKlub team with screenshots or a screen recording.
            </span>
            <span className="dash-help__link">
              Report an issue <ArrowRight size={16} aria-hidden />
            </span>
          </button>
        </div>

        <section className="dash-kpis animate-in-delay-2" aria-label="Key numbers">
          <StatCard label="Total students" value={total} tone="brand" icon={Users} />
          <StatCard label="With testimonials" value={uploaded} tone="success" icon={CheckCircle2} hint={`${coverage}% of students`} />
          <StatCard label="Pending students" value={pending} tone="danger" icon={Clock3} hint="No uploads yet" />
          <StatCard label="Assigned schools" value={schools.length} tone="purple" icon={Building2} />
        </section>

        <div className="animate-in-delay-2">
          <AttentionCard />
        </div>

        <section className="dash-section animate-in-delay-2" aria-labelledby="dash-quick">
          <div className="section-header">
            <h2 id="dash-quick" className="section-title">Quick links</h2>
          </div>
          <div className="dash-tiles">
            {QUICK_LINKS.map(({ id, label, hint, path, Icon, tone }) => (
              <button key={id} type="button" className="dash-tile" onClick={() => navigate(path)}>
                <span className={`dash-tile__art tone-${tone}`} aria-hidden>
                  <Icon size={28} strokeWidth={1.75} />
                </span>
                <span className="dash-tile__label">{label}</span>
                <span className="dash-tile__hint">{hint}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="dash-section animate-in-delay-3" aria-labelledby="dash-schools">
          <div className="section-header">
            <h2 id="dash-schools" className="section-title">Assigned schools</h2>
            {schools.length > 0 && (
              <button type="button" className="link-btn" onClick={() => navigate('/schools')}>
                View all
              </button>
            )}
          </div>

          {schools.length === 0 ? (
            <div className="dash-empty">
              <School size={32} aria-hidden />
              <p className="dash-empty__title">No schools assigned</p>
              <p className="dash-empty__text">Ask your WizKlub coordinator to map your schools and batches.</p>
            </div>
          ) : (
            <div className="dash-schools">
              {schools.map((school, index) => (
                <button
                  key={school.id}
                  type="button"
                  className="dash-school"
                  onClick={() => navigate(`/schools/${school.id}/batches`)}
                >
                  <span className={`dash-school__art tone-${SCHOOL_TONES[index % SCHOOL_TONES.length]}`} aria-hidden>
                    <Building2 size={24} strokeWidth={1.75} />
                  </span>
                  <span className="dash-school__body">
                    <span className="dash-school__name">{school.name}</span>
                    <span className="dash-school__meta">
                      {school.batch_count} batch{school.batch_count === 1 ? '' : 'es'} · {school.student_count} students
                    </span>
                  </span>
                  <span className="dash-school__go">
                    Open <ArrowRight size={16} aria-hidden />
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  )
}
