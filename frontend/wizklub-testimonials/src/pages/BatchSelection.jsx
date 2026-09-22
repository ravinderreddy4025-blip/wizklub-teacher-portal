import { useEffect, useState } from 'react'
import { api } from '../api/client'
import AppShell from '../components/layout/AppShell'
import LoadingScreen from '../components/ui/LoadingScreen'
import PageHeader from '../components/ui/PageHeader'
import { IconChevronRight, IconUsers } from '../components/icons/Icons'
import { HeartPulse, Play } from 'lucide-react'
import { batchHealthPath } from '../lib/health'
import { useNavigate } from '../router'
import '../styles/app.css'
import './pages.css'
import './health.css'

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
  const [attention, setAttention] = useState({})

  useEffect(() => {
    api.getBatches(schoolId).then(setData)
  }, [schoolId])

  // Optional: per-batch "needs attention" counts from the health snapshot (silently absent if none).
  useEffect(() => {
    let alive = true
    api.getHealthAttention().then((result) => {
      if (!alive || !result?.run) return
      setAttention(Object.fromEntries((result.batches ?? []).map((b) => [String(b.batch_id), b])))
    })
    return () => {
      alive = false
    }
  }, [])

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
            <div
              key={batch.id}
              className="batch-card batch-card--split"
              style={{ borderLeftColor: healthBorderColor[batch.health_tag] }}
            >
              <button
                type="button"
                className="batch-card__main"
                onClick={() => navigate(`/schools/${schoolId}/batches/${batch.id}/students`)}
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
              <div className="batch-card__actions">
                <span className="batch-card__health-note">
                  {attention[String(batch.id)]
                    ? attention[String(batch.id)].red > 0
                      ? `${attention[String(batch.id)].red} student${attention[String(batch.id)].red === 1 ? '' : 's'} need attention`
                      : 'No students in Red'
                    : 'Participation, outcomes & attendance'}
                </span>
                <span className="batch-card__btns">
                  <button
                    type="button"
                    className="batch-card__start"
                    onClick={() => navigate(`/schools/${schoolId}/batches/${batch.id}/class`)}
                  >
                    <Play size={15} aria-hidden /> Start class
                  </button>
                  <button
                    type="button"
                    className="batch-card__health"
                    onClick={() => navigate(batchHealthPath(batch.id, schoolId))}
                  >
                    <HeartPulse size={16} aria-hidden /> Health
                  </button>
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  )
}
