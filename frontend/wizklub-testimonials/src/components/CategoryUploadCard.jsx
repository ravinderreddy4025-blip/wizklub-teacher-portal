import { useRef, useState } from 'react'
import { REVIEW_CATEGORY_LABELS } from '../api/constants'
import { IconPlay, IconUpload } from './icons/Icons'

function formatSubmittedDate(value) {
  if (!value) return ''
  return new Date(value).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function MediaTile({ upload, onRemove, readOnly = false }) {
  return (
    <div className={`media-tile ${readOnly ? 'media-tile--readonly' : ''}`}>
      <div className="media-tile__preview">
        {upload.media_type === 'video' ? (
          <>
            <img src={upload.blob_url} alt="" className="media-tile__image" />
            <span className="media-tile__play" aria-hidden="true">
              <IconPlay />
            </span>
          </>
        ) : (
          <img src={upload.blob_url} alt="" className="media-tile__image" />
        )}
        <span className="media-tile__type">{upload.media_type === 'video' ? 'Video' : 'Photo'}</span>
      </div>
      {!readOnly && onRemove && (
        <button type="button" className="media-tile__remove" onClick={() => onRemove(upload.id)}>
          Remove
        </button>
      )}
      {readOnly && upload.submitted_at && (
        <span className="media-tile__date">{formatSubmittedDate(upload.submitted_at)}</span>
      )}
    </div>
  )
}

function getStatusBadge(complete, draftCount) {
  if (draftCount > 0) return { className: 'badge--progress', label: `${draftCount} ready to submit` }
  if (complete) return { className: 'badge--uploaded', label: 'Submitted' }
  return { className: 'badge--pending', label: 'Pending' }
}

export default function CategoryUploadCard({
  category,
  drafts = [],
  submitted = [],
  complete,
  onUpload,
  onDelete,
  onSubmit,
  uploading,
  submitting,
}) {
  const inputRef = useRef(null)
  const [error, setError] = useState('')
  const status = getStatusBadge(complete, drafts.length)

  const handleFileChange = async (event) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!files.length) return

    setError('')
    const result = await onUpload(category, files)
    if (!result.ok) setError(result.error)
  }

  const handleSubmit = async () => {
    setError('')
    const result = await onSubmit(category)
    if (!result.ok) setError(result.error)
  }

  const submitLabel = submitting
    ? 'Submitting…'
    : drafts.length === 0
      ? 'Submit'
      : drafts.length === 1
        ? 'Submit 1 item'
        : `Submit ${drafts.length} items`

  return (
    <div className={`category-card card ${complete ? 'category-card--complete' : ''} ${drafts.length ? 'category-card--draft' : ''}`}>
      <div className="category-card__header">
        <h3 className="category-card__title">{REVIEW_CATEGORY_LABELS[category]}</h3>
        <span className={`badge ${status.className}`}>{status.label}</span>
      </div>

      {drafts.length > 0 && (
        <div className="category-card__section">
          <p className="category-card__section-label">Ready to submit</p>
          <div className="media-grid">
            {drafts.map((upload) => (
              <MediaTile key={upload.id} upload={upload} onRemove={onDelete} />
            ))}
          </div>
        </div>
      )}

      {submitted.length > 0 && (
        <div className="category-card__section">
          <p className="category-card__section-label">Previously submitted</p>
          <div className="media-grid">
            {submitted.map((upload) => (
              <MediaTile key={upload.id} upload={upload} readOnly />
            ))}
          </div>
        </div>
      )}

      {drafts.length === 0 && submitted.length === 0 && (
        <div className="category-card__empty">
          <span className="category-card__empty-icon">
            <IconUpload size={18} />
          </span>
          <span>Add photos / videos, then submit to post them.</span>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/gif,image/tiff,video/mp4,video/quicktime,video/3gpp,video/x-matroska,video/webm,video/x-msvideo,video/x-m4v,.heic,.heif,.mkv,.3gp,.avi,.m4v"
        hidden
        onChange={handleFileChange}
      />

      <div className="category-card__actions">
        <button
          type="button"
          className="btn-outline category-card__upload"
          disabled={uploading || submitting}
          onClick={() => inputRef.current?.click()}
        >
          <IconUpload size={16} />
          {uploading ? 'Uploading…' : 'Add photo / video'}
        </button>

        <button
          type="button"
          className="btn-primary category-card__submit"
          disabled={uploading || submitting || drafts.length === 0}
          onClick={handleSubmit}
        >
          {submitLabel}
        </button>
      </div>

      {error && <p className="category-card__error">{error}</p>}
    </div>
  )
}
