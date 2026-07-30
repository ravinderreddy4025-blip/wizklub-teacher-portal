import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { api } from '../api/client'
import { FEEDBACK_STATUS_LABELS, MAX_FEEDBACK_ATTACHMENTS } from '../api/constants'
import AppShell from '../components/layout/AppShell'
import PageHeader from '../components/ui/PageHeader'
import { IconFeedback, IconPlus } from '../components/icons/Icons'
import { useNavigate } from '../router'
import './pages.css'
import './Feedback.css'

let cachedFeedbackItems = null

export function invalidateFeedbackListCache() {
  cachedFeedbackItems = null
}

function formatDate(value) {
  if (!value) return ''
  return new Date(value).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function StatusBadge({ status }) {
  return (
    <span className={`feedback-badge feedback-badge--${status}`}>
      {FEEDBACK_STATUS_LABELS[status] || status}
    </span>
  )
}

export default function FeedbackList() {
  const navigate = useNavigate()
  const [items, setItems] = useState(() => cachedFeedbackItems ?? [])
  const [loading, setLoading] = useState(() => cachedFeedbackItems == null)

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        const result = await api.listFeedback({ page: 1, limit: 50 })
        if (cancelled) return

        if (!result?.ok && result?.items === undefined) {
          toast.error(result?.error || 'Unable to load feedback')
          if (cachedFeedbackItems == null) setItems([])
        } else {
          const next = result.items ?? []
          cachedFeedbackItems = next
          setItems(next)
        }
      } catch {
        if (!cancelled) {
          toast.error('Unable to load feedback')
          if (cachedFeedbackItems == null) setItems([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const showEmpty = !loading && items.length === 0

  if (showEmpty) {
    return (
      <AppShell activeTab="feedback" className="page-feedback">
        <div className="page feedback-empty">
          <div className="feedback-empty__icon" aria-hidden="true">
            <IconFeedback size={36} />
          </div>
          <h1 className="feedback-empty__title">No feedback submitted yet</h1>
          <p className="feedback-empty__text">
            Report tech or content issues with screenshots or videos — your team will see them here.
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => navigate('/feedback/new')}
          >
            <IconPlus size={14} /> Report an Issue
          </button>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell
      activeTab="feedback"
      className="page-feedback"
      showFab={!loading}
      fabIcon="plus"
      onFabClick={() => navigate('/feedback/new')}
    >
      <div className="page">
        <PageHeader
          title="Support"
          subtitle="Your reported issues and updates."
        >
          <button
            type="button"
            className="btn-primary feedback-header-cta"
            onClick={() => navigate('/feedback/new')}
          >
            <IconPlus size={14} /> Add Feedback
          </button>
        </PageHeader>

        {loading ? (
          <div className="feedback-list-loading" role="status">
            <div className="loading-screen__spinner" aria-hidden="true" />
            <p>Loading…</p>
          </div>
        ) : (
          <div className="feedback-list">
            {items.map((item) => (
              <button
                key={item.feedback_id}
                type="button"
                className="feedback-card card card--interactive"
                onClick={() => navigate(`/feedback/${item.feedback_id}`)}
              >
                <div className="feedback-card__top">
                  <span className="feedback-card__id">{item.feedback_id}</span>
                  <StatusBadge status={item.status} />
                  <span className="feedback-card__date">{formatDate(item.created_at)}</span>
                </div>
                <p className="feedback-card__summary">{item.summary}</p>
                {item.attachments?.length > 0 && (
                  <div className="feedback-card__thumbs">
                    {item.attachments.slice(0, MAX_FEEDBACK_ATTACHMENTS).map((file) => (
                      <div key={`${item.feedback_id}-${file.url}`} className="feedback-card__thumb">
                        {file.type === 'video' ? (
                          <video src={file.url} muted playsInline preload="metadata" />
                        ) : (
                          <img src={file.url} alt="" loading="lazy" />
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <span className="feedback-card__link">View details →</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
