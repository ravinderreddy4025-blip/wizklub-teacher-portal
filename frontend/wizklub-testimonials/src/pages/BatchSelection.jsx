import { useEffect, useState } from 'react'
import { api } from '../api/client'
import AppShell from '../components/layout/AppShell'
import LoadingScreen from '../components/ui/LoadingScreen'
import PageHeader from '../components/ui/PageHeader'
import { IconChevronRight, IconUsers } from '../components/icons/Icons'
import { useNavigate } from '../router'
import '../styles/app.css'
import './pages.css'

const healthBadgeClass = {
  actively_uploading: 'badge--tag-success',
  in_progress: 'badge--tag-warning',
  need_to_grow: 'badge--tag-danger',
}

const healthBorderColor = {
  actively_uploading: 'var(--tag-success)',
  in_progress: 'var(--tag-warning)',
  need_to_grow: 'var(--tag-danger)',
}

export default function BatchSelection({ schoolId }) {
  const navigate = useNavigate()
  const [data, setData] = useState(null)

  useEffect(() => {
    api.getBatches(schoolId).then(setData)
  }, [schoolId])

  if (!data) {
    return (
      <AppShell topBarVariant="back" activeTab="schools" className="page-batches">
        <LoadingScreen message="Loading batches…" />
      </AppShell>
    )
  }

  return (
    <AppShell topBarVariant="back" activeTab="schools" className="page-batches">
      <div className="page animate-in">
        <PageHeader
          eyebrow={data.school.name}
          title="Select Batch"
          subtitle="Open a batch to review student completion and upload media."
        />

        <div className="batch-list">
          {data.batches.map((batch) => (
            <button
              key={batch.id}
              type="button"
              className="batch-card"
              style={{ borderLeftColor: healthBorderColor[batch.health_tag] }}
              onClick={() => navigate(`/batches/${batch.id}/students`)}
            >
              <div className="batch-card__top">
                <div>
                  <span className={`badge ${healthBadgeClass[batch.health_tag]}`}>
                    <span className="badge__dot" />
                    {batch.health_label}
                  </span>
                  <h3 className="batch-card__name">{batch.name}</h3>
                </div>
                <span className="chevron-btn" aria-hidden="true">
                  <IconChevronRight size={12} />
                </span>
              </div>
              <div className="batch-card__students">
                <IconUsers size={14} />
                <span>{batch.student_count} students</span>
              </div>
              <div className="batch-card__progress">
                <div className="batch-card__progress-header">
                  <span className="label-caps">Batch completion</span>
                  <span className="batch-card__percent">{batch.completion_avg}%</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-bar__fill" style={{ width: `${batch.completion_avg}%` }} />
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </AppShell>
  )
}
