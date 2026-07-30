import { useEffect, useState } from 'react'
import { api } from '../api/client'
import AppShell from '../components/layout/AppShell'
import LoadingScreen from '../components/ui/LoadingScreen'
import PageHeader from '../components/ui/PageHeader'
import { IconChevronRight } from '../components/icons/Icons'
import { assetUrl } from '../lib/assets.js'
import { useNavigate } from '../router'
import '../styles/app.css'
import './pages.css'

const schoolImages = [
  assetUrl('assets/school-campus.png'),
  assetUrl('assets/university-library.png'),
  assetUrl('assets/elementary-hallway.png'),
]

export default function SchoolsList() {
  const navigate = useNavigate()
  const [schools, setSchools] = useState(null)

  useEffect(() => {
    api.getSchools().then((result) => setSchools(result ?? []))
  }, [])

  if (!schools) {
    return (
      <AppShell topBarVariant="back" activeTab="schools" className="page-schools-list">
        <LoadingScreen message="Loading schools…" />
      </AppShell>
    )
  }

  return (
    <AppShell topBarVariant="back" activeTab="schools" className="page-schools-list">
      <div className="page animate-in">
        <PageHeader
          eyebrow="Navigation"
          title="Assigned Schools"
          subtitle="Choose a school to view batches and student upload progress."
        />

        <div className="schools-list">
          {schools.map((school, index) => (
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
      </div>
    </AppShell>
  )
}
