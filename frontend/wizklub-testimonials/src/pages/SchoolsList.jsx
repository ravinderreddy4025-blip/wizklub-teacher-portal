import { useEffect, useState } from 'react'
import { ArrowRight, Building2 } from 'lucide-react'
import { api } from '../api/client'
import AppShell from '../components/layout/AppShell'
import PageHeader from '../components/ui/PageHeader'
import { useNavigate } from '../router'
import '../styles/app.css'
import './pages.css'

// Same pastel tile tones as the dashboard's school cards.
const SCHOOL_TONES = ['blue', 'orange', 'green', 'purple', 'gold']

function SchoolsSkeleton() {
  return (
    <div className="dash-schools" aria-busy="true" aria-label="Loading schools">
      {[0, 1].map((i) => (
        <div key={i} className="skeleton skeleton--kpi" />
      ))}
    </div>
  )
}

export default function SchoolsList() {
  const navigate = useNavigate()
  const [schools, setSchools] = useState(null)

  useEffect(() => {
    api.getSchools().then((result) => setSchools(result ?? []))
  }, [])

  const totals = (schools || []).reduce(
    (acc, s) => ({ batches: acc.batches + (s.batch_count || 0), students: acc.students + (s.student_count || 0) }),
    { batches: 0, students: 0 },
  )

  return (
    <AppShell activeTab="schools" className="page-schools-list">
      <div className="page animate-in">
        <PageHeader
          title="Schools"
          subtitle={
            schools && schools.length > 0
              ? `${schools.length} school${schools.length === 1 ? '' : 's'} · ${totals.batches} batches · ${totals.students} students. Open a school to see its batches and student uploads.`
              : 'Open a school to see its batches and student uploads.'
          }
        />

        {!schools ? (
          <SchoolsSkeleton />
        ) : schools.length === 0 ? (
          <div className="dash-empty">
            <Building2 size={32} aria-hidden />
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
      </div>
    </AppShell>
  )
}
