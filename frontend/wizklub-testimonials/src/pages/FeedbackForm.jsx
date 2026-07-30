import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-toastify'
import { api } from '../api/client'
import { FEEDBACK_CATEGORIES, MAX_FEEDBACK_ATTACHMENTS } from '../api/constants'
import { validateUploadFile } from '../lib/uploads'
import AppShell from '../components/layout/AppShell'
import PageHeader from '../components/ui/PageHeader'
import LoadingScreen from '../components/ui/LoadingScreen'
import { IconUpload } from '../components/icons/Icons'
import { useNavigate } from '../router'
import { invalidateFeedbackListCache } from './FeedbackList'
import './pages.css'
import './Feedback.css'

function revokePreviews(files) {
  files.forEach((item) => {
    if (item.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl)
  })
}

export default function FeedbackForm() {
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const query = useMemo(() => new URLSearchParams(window.location.search), [])
  const contextSchoolId = query.get('school_id') || ''
  const contextBatchId = query.get('batch_id') || ''

  const [loadingContext, setLoadingContext] = useState(true)
  const [schools, setSchools] = useState([])
  const [batches, setBatches] = useState([])
  const [schoolId, setSchoolId] = useState(contextSchoolId)
  const [batchId, setBatchId] = useState(contextBatchId)
  const [category, setCategory] = useState('tech_issue')
  const [summary, setSummary] = useState('')
  const [files, setFiles] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const schoolLocked = Boolean(contextSchoolId)
  const batchLocked = Boolean(contextBatchId)
  const selectedSchool = schools.find((s) => s.id === schoolId)
  const selectedBatch = batches.find((b) => b.id === batchId)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const schoolList = (await api.getSchools()) || []
      if (cancelled) return
      setSchools(schoolList)

      // Only prefill when opened with school/batch context; otherwise leave optional.
      const initialSchool = contextSchoolId || ''
      setSchoolId(initialSchool)

      if (initialSchool) {
        const batchData = await api.getBatches(initialSchool)
        if (cancelled) return
        const batchList = batchData?.batches || []
        setBatches(batchList)
        setBatchId(contextBatchId || '')
      }
      setLoadingContext(false)
    })()
    return () => {
      cancelled = true
    }
  }, [contextSchoolId, contextBatchId])

  useEffect(() => () => revokePreviews(files), [files])

  const loadBatches = async (nextSchoolId) => {
    setSchoolId(nextSchoolId)
    setBatchId('')
    setBatches([])
    if (!nextSchoolId) return
    const batchData = await api.getBatches(nextSchoolId)
    const batchList = batchData?.batches || []
    setBatches(batchList)
    setBatchId('')
  }

  const addFiles = (fileList) => {
    const incoming = Array.from(fileList || [])
    if (!incoming.length) return

    const next = [...files]
    for (const file of incoming) {
      if (next.length >= MAX_FEEDBACK_ATTACHMENTS) {
        toast.error(`Maximum ${MAX_FEEDBACK_ATTACHMENTS} attachments.`)
        break
      }
      const validation = validateUploadFile(file)
      if (!validation.ok) {
        toast.error(validation.error)
        continue
      }
      next.push({
        file,
        previewUrl: URL.createObjectURL(file),
        mediaType: validation.mediaType,
      })
    }
    setFiles(next)
  }

  const removeFile = (index) => {
    setFiles((prev) => {
      const copy = [...prev]
      const [removed] = copy.splice(index, 1)
      if (removed?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(removed.previewUrl)
      return copy
    })
  }

  const canSubmit = summary.trim().length > 0 && !submitting

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!canSubmit) return

    setSubmitting(true)
    try {
      const result = await api.createFeedback({
        school_id: schoolId || '',
        batch_id: batchId || '',
        category: category || 'other',
        summary: summary.trim(),
        files: files.map((item) => item.file),
      })

      if (!result.ok) {
        toast.error(result.error || 'Failed to submit feedback')
        return
      }

      if (result.warning) toast.warn(result.warning)
      toast.success('Feedback submitted')
      invalidateFeedbackListCache()
      navigate(`/feedback/${result.feedback.feedback_id}`)
    } finally {
      setSubmitting(false)
    }
  }

  if (loadingContext) {
    return (
      <AppShell topBarVariant="back" activeTab="feedback" className="page-feedback">
        <LoadingScreen message="Preparing form…" />
      </AppShell>
    )
  }

  return (
    <AppShell topBarVariant="back" activeTab="feedback" className="page-feedback">
      <div className="page">
        <PageHeader
          title="Report an Issue"
          subtitle="Describe the problem and attach screenshots or videos if helpful."
        />

        <form className="feedback-form card" onSubmit={handleSubmit}>
          <div className="feedback-form__row">
            <label className="feedback-form__label" htmlFor="feedback-school">
              School
            </label>
            {schoolLocked ? (
              <input
                id="feedback-school"
                className="feedback-form__input"
                value={selectedSchool?.name || schoolId}
                readOnly
              />
            ) : (
              <select
                id="feedback-school"
                className="feedback-form__input"
                value={schoolId}
                onChange={(e) => loadBatches(e.target.value)}
              >
                <option value="">Select school</option>
                {schools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="feedback-form__row">
            <label className="feedback-form__label" htmlFor="feedback-batch">
              Batch
            </label>
            {batchLocked ? (
              <input
                id="feedback-batch"
                className="feedback-form__input"
                value={selectedBatch?.name || batchId}
                readOnly
              />
            ) : (
              <select
                id="feedback-batch"
                className="feedback-form__input"
                value={batchId}
                onChange={(e) => setBatchId(e.target.value)}
              >
                <option value="">Select batch</option>
                {batches.map((batch) => (
                  <option key={batch.id} value={batch.id}>
                    {batch.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="feedback-form__row">
            <label className="feedback-form__label" htmlFor="feedback-category">
              Category
            </label>
            <select
              id="feedback-category"
              className="feedback-form__input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {FEEDBACK_CATEGORIES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div className="feedback-form__row">
            <label className="feedback-form__label" htmlFor="feedback-summary">
              Summary <span className="feedback-form__required" aria-hidden="true">*</span>
            </label>
            <textarea
              id="feedback-summary"
              className="feedback-form__textarea"
              rows={4}
              placeholder="What went wrong? Include steps if helpful."
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              required
            />
          </div>

          <div className="feedback-form__row">
            <span className="feedback-form__label">Attachments</span>
            <div
              className={`feedback-dropzone ${dragOver ? 'feedback-dropzone--active' : ''}`}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                addFiles(e.dataTransfer.files)
              }}
              onClick={() => inputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
              }}
            >
              <IconUpload size={18} />
              <p>Drag & drop or tap to upload photos / videos</p>
              <span>Up to {MAX_FEEDBACK_ATTACHMENTS} files</span>
            </div>
            <input
              ref={inputRef}
              type="file"
              multiple
              hidden
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/gif,image/tiff,video/mp4,video/quicktime,video/3gpp,video/x-matroska,video/webm,video/x-msvideo,video/x-m4v,.heic,.heif,.mkv,.3gp,.avi,.m4v"
              onChange={(e) => {
                addFiles(e.target.files)
                e.target.value = ''
              }}
            />

            {files.length > 0 && (
              <div className="feedback-preview-grid">
                {files.map((item, index) => (
                  <div key={`${item.file.name}-${index}`} className="feedback-preview">
                    {item.mediaType === 'video' ? (
                      <video src={item.previewUrl} muted playsInline />
                    ) : (
                      <img src={item.previewUrl} alt="" />
                    )}
                    <button
                      type="button"
                      className="feedback-preview__remove"
                      onClick={() => removeFile(index)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button type="submit" className="btn-primary feedback-form__submit" disabled={!canSubmit}>
            {submitting ? 'Submitting…' : 'Submit feedback'}
          </button>
        </form>
      </div>
    </AppShell>
  )
}
