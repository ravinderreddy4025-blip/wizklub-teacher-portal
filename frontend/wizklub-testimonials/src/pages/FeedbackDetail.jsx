import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { api } from '../api/client'
import { FEEDBACK_CATEGORIES, FEEDBACK_STATUS_LABELS } from '../api/constants'
import AppShell from '../components/layout/AppShell'
import PageHeader from '../components/ui/PageHeader'
import LoadingScreen from '../components/ui/LoadingScreen'
import { useNavigate } from '../router'
import './pages.css'
import './Feedback.css'

function formatDate(value) {
  if (!value) return ''
  return new Date(value).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function categoryLabel(value) {
  return FEEDBACK_CATEGORIES.find((item) => item.value === value)?.label || value
}

export default function FeedbackDetail({ feedbackId }) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState(null)
  const [lightbox, setLightbox] = useState(null)

  useEffect(() => {
    let cancelled = false
    api.getFeedback(feedbackId).then((result) => {
      if (cancelled) return
      if (!result.ok) {
        toast.error(result.error || 'Feedback not found')
        navigate('/feedback')
        return
      }
      setFeedback(result.feedback)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [feedbackId, navigate])

  if (loading || !feedback) {
    return (
      <AppShell topBarVariant="back" activeTab="feedback" className="page-feedback">
        <LoadingScreen message="Loading feedback…" />
      </AppShell>
    )
  }

  return (
    <AppShell topBarVariant="back" activeTab="feedback" className="page-feedback">
      <div className="page">
        <PageHeader
          eyebrow={feedback.feedback_id}
          title={categoryLabel(feedback.category)}
          subtitle={`${feedback.school_name} · ${feedback.batch_name}`}
        />

        <div className="feedback-detail card">
          <div className="feedback-detail__meta">
            <span className={`feedback-badge feedback-badge--${feedback.status}`}>
              {FEEDBACK_STATUS_LABELS[feedback.status] || feedback.status}
            </span>
            <span>{formatDate(feedback.created_at)}</span>
          </div>

          <h3 className="feedback-detail__label">Summary</h3>
          <p className="feedback-detail__summary">{feedback.summary}</p>

          {feedback.resolution_note ? (
            <>
              <h3 className="feedback-detail__label">Resolution note</h3>
              <p className="feedback-detail__summary">{feedback.resolution_note}</p>
            </>
          ) : null}

          {feedback.attachments?.length > 0 && (
            <>
              <h3 className="feedback-detail__label">Attachments</h3>
              <div className="feedback-gallery">
                {feedback.attachments.map((file) => (
                  <button
                    key={file.url}
                    type="button"
                    className="feedback-gallery__item"
                    onClick={() => setLightbox(file)}
                  >
                    {file.type === 'video' ? (
                      <video src={file.url} muted playsInline />
                    ) : (
                      <img src={file.url} alt={file.filename || 'Attachment'} />
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {lightbox && (
        <div className="feedback-lightbox" onClick={() => setLightbox(null)} role="presentation">
          <div className="feedback-lightbox__panel" onClick={(e) => e.stopPropagation()} role="dialog">
            {lightbox.type === 'video' ? (
              <video src={lightbox.url} controls autoPlay playsInline />
            ) : (
              <img src={lightbox.url} alt={lightbox.filename || 'Attachment'} />
            )}
            <button type="button" className="btn-outline" onClick={() => setLightbox(null)}>
              Close
            </button>
          </div>
        </div>
      )}
    </AppShell>
  )
}
