import { useEffect, useRef, useState } from 'react'
import { toast } from 'react-toastify'
import { api } from '../api/client'
import { REVIEW_CATEGORIES, REVIEW_CATEGORY_LABELS } from '../api/constants'
import { IconCamera, IconUpload } from './icons/Icons'
import './QuickUploadSheet.css'

const AVATAR_COLORS = [
  '#E57373', '#F06292', '#BA68C8', '#9575CD',
  '#7986CB', '#64B5F6', '#4FC3F7', '#4DD0E1',
  '#4DB6AC', '#81C784', '#AED581', '#FF8A65',
]

function getAvatarColor(name) {
  let hash = 0
  for (let i = 0; i < (name ?? '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function InitialsAvatar({ name, size = 40 }) {
  const initial = name ? name.trim()[0].toUpperCase() : '?'
  const bg = getAvatarColor(name)
  return (
    <div
      style={{
        width: size, height: size, borderRadius: 8, background: bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontWeight: 700, fontSize: size * 0.4, flexShrink: 0,
      }}
    >
      {initial}
    </div>
  )
}

function StudentAvatar({ image, name, size = 40 }) {
  if (image) return <img src={image} alt="" style={{ width: size, height: size, borderRadius: 8, objectFit: 'cover' }} />
  return <InitialsAvatar name={name} size={size} />
}

function resetFilePreview(previewUrl) {
  if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl)
}

export default function QuickUploadSheet({
  open,
  student,
  students = [],
  onClose,
  onSuccess,
}) {
  const cameraInputRef = useRef(null)
  const galleryInputRef = useRef(null)

  const [pickedStudent, setPickedStudent] = useState(null)
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [category, setCategory] = useState('')
  const [submitNow, setSubmitNow] = useState(false)
  const [step, setStep] = useState('source')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const activeStudent = student ?? pickedStudent
  const needsPicker = open && !student && students.length > 0

  useEffect(() => {
    if (!open) return
    setPickedStudent(student ?? null)
    setFile(null)
    setPreviewUrl(null)
    setCategory('')
    setSubmitNow(false)
    setStep(student ? 'source' : students.length ? 'pick-student' : 'source')
    setUploading(false)
    setError('')
    setSuccessMessage('')
  }, [open, student, students.length])

  useEffect(() => {
    return () => resetFilePreview(previewUrl)
  }, [previewUrl])

  if (!open) return null

  const handleClose = () => {
    resetFilePreview(previewUrl)
    onClose()
  }

  const handleFileChange = (event) => {
    const selected = event.target.files?.[0]
    event.target.value = ''
    if (!selected) return

    resetFilePreview(previewUrl)
    setFile(selected)
    setPreviewUrl(URL.createObjectURL(selected))
    setCategory((current) => current || REVIEW_CATEGORIES[0])
    setStep('review')
    setError('')
  }

  const handleConfirm = async () => {
    if (!activeStudent || !file || !category) {
      setError('Choose a photo or video and a category.')
      return
    }

    setUploading(true)
    setError('')

    const uploadResult = await api.uploadMedia(activeStudent.id, category, file)
    if (!uploadResult.ok) {
      setUploading(false)
      setError(uploadResult.error || 'Upload failed.')
      toast.error(uploadResult.error || 'Upload failed.')
      return
    }

    if (submitNow) {
      const submitResult = await api.submitCategory(activeStudent.id, category)
      if (!submitResult.ok) {
        setUploading(false)
        setError(submitResult.error || 'Saved as draft, but submit failed.')
        toast.warning('Saved as draft, but submit failed.')
        return
      }
    }

    setUploading(false)
    const msg = submitNow
      ? `Submitted to ${REVIEW_CATEGORY_LABELS[category]} for ${activeStudent.full_name}`
      : `Saved to ${REVIEW_CATEGORY_LABELS[category]} for ${activeStudent.full_name}`
    setSuccessMessage(submitNow ? msg + '.' : msg + '. Submit from profile when ready.')
    setStep('success')
    toast.success(msg)
    onSuccess?.()
  }

  const handleUploadAnother = () => {
    resetFilePreview(previewUrl)
    setFile(null)
    setPreviewUrl(null)
    setCategory('')
    setSubmitNow(false)
    setStep('source')
    setError('')
    setSuccessMessage('')
  }

  const isVideo = file?.type?.startsWith('video/')

  return (
    <div className="quick-upload-backdrop" role="presentation" onClick={handleClose}>
      <div
        className="quick-upload-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-upload-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="quick-upload-sheet__handle" aria-hidden="true" />

        {step === 'pick-student' && needsPicker && (
          <>
            <h2 id="quick-upload-title" className="quick-upload-sheet__title">
              Upload for which student?
            </h2>
            <p className="quick-upload-sheet__subtitle">Select a student to continue.</p>
            <ul className="quick-upload-picker">
              {students.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="quick-upload-picker__item"
                    onClick={() => {
                      setPickedStudent(s)
                      setStep('source')
                    }}
                  >
                    <StudentAvatar image={s.image} name={s.full_name} size={36} />
                    <span className="quick-upload-picker__name">{s.full_name}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="btn-outline" onClick={handleClose}>
              Cancel
            </button>
          </>
        )}

        {step !== 'pick-student' && activeStudent && (
          <header className="quick-upload-sheet__student">
            <StudentAvatar image={activeStudent.image} name={activeStudent.full_name} size={44} />
            <div>
              <h2 id="quick-upload-title" className="quick-upload-sheet__title">
                {step === 'success' ? 'Upload complete' : `Upload for ${activeStudent.full_name}`}
              </h2>
              {step !== 'success' && (
                <p className="quick-upload-sheet__subtitle">
                  Take or choose media, then map it to a review category.
                </p>
              )}
            </div>
          </header>
        )}

        {step === 'source' && activeStudent && (
          <>
            <div className="quick-upload-source">
              <button
                type="button"
                className="quick-upload-source__btn"
                onClick={() => cameraInputRef.current?.click()}
              >
                <IconCamera size={24} />
                <span>Take photo / video</span>
              </button>
              <button
                type="button"
                className="quick-upload-source__btn"
                onClick={() => galleryInputRef.current?.click()}
              >
                <IconUpload size={22} />
                <span>Choose from gallery</span>
              </button>
            </div>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*,video/*"
              capture="environment"
              hidden
              onChange={handleFileChange}
            />
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/gif,image/tiff,video/mp4,video/quicktime,video/3gpp,video/x-matroska,video/webm,video/x-msvideo,video/x-m4v,.heic,.heif,.mkv,.3gp,.avi,.m4v"
              hidden
              onChange={handleFileChange}
            />
            <button type="button" className="btn-outline" onClick={handleClose}>
              Cancel
            </button>
          </>
        )}

        {step === 'review' && activeStudent && file && (
          <>
            <div className="quick-upload-preview">
              {isVideo ? (
                <video src={previewUrl} className="quick-upload-preview__media" controls playsInline />
              ) : (
                <img src={previewUrl} alt="Preview" className="quick-upload-preview__media" />
              )}
              <button
                type="button"
                className="quick-upload-preview__change"
                onClick={() => {
                  resetFilePreview(previewUrl)
                  setFile(null)
                  setPreviewUrl(null)
                  setStep('source')
                }}
              >
                Change media
              </button>
            </div>

            <label className="quick-upload-field">
              <span className="quick-upload-field__label">Category</span>
              <select
                className="quick-upload-field__select"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="" disabled>
                  Select category…
                </option>
                {REVIEW_CATEGORIES.map((key) => (
                  <option key={key} value={key}>
                    {REVIEW_CATEGORY_LABELS[key]}
                  </option>
                ))}
              </select>
              <span className="quick-upload-field__hint">
                This media will be saved under the category you select.
              </span>
            </label>

            <label className="quick-upload-toggle">
              <input
                type="checkbox"
                checked={submitNow}
                onChange={(e) => setSubmitNow(e.target.checked)}
              />
              <span>Submit now (post immediately instead of saving as draft)</span>
            </label>

            <div className="quick-upload-summary card">
              <p className="quick-upload-summary__row">
                <span>Student</span>
                <strong>{activeStudent.full_name}</strong>
              </p>
              <p className="quick-upload-summary__row">
                <span>Category</span>
                <strong>{category ? REVIEW_CATEGORY_LABELS[category] : '—'}</strong>
              </p>
              <p className="quick-upload-summary__row">
                <span>Action</span>
                <strong>{submitNow ? 'Submit immediately' : 'Save as draft'}</strong>
              </p>
            </div>

            {error && <p className="quick-upload-sheet__error">{error}</p>}

            <div className="quick-upload-sheet__actions">
              <button type="button" className="btn-outline" onClick={handleClose} disabled={uploading}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleConfirm}
                disabled={uploading || !category}
              >
                {uploading ? 'Uploading…' : 'Confirm upload'}
              </button>
            </div>
          </>
        )}

        {step === 'success' && (
          <>
            <p className="quick-upload-sheet__success">{successMessage}</p>
            <div className="quick-upload-sheet__actions">
              <button type="button" className="btn-outline" onClick={handleUploadAnother}>
                Upload another
              </button>
              <button type="button" className="btn-primary" onClick={handleClose}>
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
