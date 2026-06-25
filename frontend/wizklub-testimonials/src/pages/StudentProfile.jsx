import { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { api } from '../api/client'
import CategoryUploadCard from '../components/CategoryUploadCard'
import QuickUploadSheet from '../components/QuickUploadSheet'
import AppShell from '../components/layout/AppShell'
import LoadingScreen from '../components/ui/LoadingScreen'
import { IconCamera } from '../components/icons/Icons'
import '../styles/app.css'
import './pages.css'

const INITIALS_COLORS = [
  '#E57373', '#F06292', '#BA68C8', '#9575CD',
  '#7986CB', '#64B5F6', '#4FC3F7', '#4DD0E1',
  '#4DB6AC', '#81C784', '#AED581', '#FF8A65',
]

function getInitials(name) {
  if (!name) return '?'
  return name.trim()[0].toUpperCase()
}

function getInitialsColor(name) {
  let hash = 0
  for (let i = 0; i < (name ?? '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return INITIALS_COLORS[Math.abs(hash) % INITIALS_COLORS.length]
}

function Avatar({ image, name, size = 56 }) {
  if (image) return <img src={image} alt={name} />
  const initials = getInitials(name)
  const bg = getInitialsColor(name)
  return (
    <div
      style={{
        width: size, height: size, borderRadius: 12, background: bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontWeight: 700, fontSize: size * 0.35, letterSpacing: 0.5,
      }}
    >
      {initials}
    </div>
  )
}

function CompletionRing({ value, large }) {
  return (
    <div
      className={`completion-ring ${large ? 'completion-ring--lg' : ''}`}
      style={{ '--progress': value }}
    >
      <div className="completion-ring__inner">{value}%</div>
    </div>
  )
}

export default function StudentProfile({ studentId }) {
  const [data, setData] = useState(null)
  const [uploadingCategory, setUploadingCategory] = useState(null)
  const [submittingCategory, setSubmittingCategory] = useState(null)
  const [quickUploadOpen, setQuickUploadOpen] = useState(false)

  const loadStudent = useCallback(async () => {
    const result = await api.getStudent(studentId)
    setData(result)
  }, [studentId])

  useEffect(() => {
    loadStudent()
  }, [loadStudent])

  const handleUpload = async (category, files) => {
    setUploadingCategory(category)
    let lastError = null

    for (const file of files) {
      const result = await api.uploadMedia(studentId, category, file)
      if (!result.ok) lastError = result.error
    }

    setUploadingCategory(null)
    await loadStudent()
    if (lastError) {
      toast.error(lastError)
      return { ok: false, error: lastError }
    }
    toast.success(`${files.length > 1 ? 'Files' : 'File'} uploaded successfully`)
    return { ok: true }
  }

  const handleDelete = async (uploadId) => {
    const result = await api.deleteUpload(uploadId)
    if (result.ok) {
      toast.info('Upload deleted')
      await loadStudent()
    } else {
      toast.error('Failed to delete upload')
    }
  }

  const handleSubmit = async (category) => {
    setSubmittingCategory(category)
    const result = await api.submitCategory(studentId, category)
    setSubmittingCategory(null)
    if (result.ok) {
      toast.success('Category submitted for review')
      await loadStudent()
    } else {
      toast.error(result.error || 'Submit failed')
    }
    return result
  }

  if (!data) {
    return (
      <AppShell topBarVariant="back" activeTab="schools" className="page-profile-detail">
        <LoadingScreen message="Loading student…" />
      </AppShell>
    )
  }

  return (
    <AppShell topBarVariant="back" showRefresh activeTab="schools" className="page-profile-detail">
      <div className="animate-in">
        <div className="profile-header">
          <div className="profile-header__avatar">
            <Avatar image={data.student.image} name={data.student.full_name} size={56} />
          </div>
          <div className="profile-header__info">
            <h1 className="page__title">{data.student.full_name}</h1>
            <p className="page__subtitle">{data.batch.name}</p>
            <p className="page__subtitle">{data.school.name}</p>
          </div>
        </div>

        <div className="profile-hero">
          <div className="profile-hero__progress">
            <CompletionRing value={data.student.completion_pct} large />
            <div className="profile-hero__progress-bar">
              <p className="profile-hero__progress-label">
                {data.student.categories_done} of {data.student.categories_total} categories submitted
              </p>
              <div className="progress-bar">
                <div
                  className="progress-bar__fill"
                  style={{ width: `${data.student.completion_pct}%` }}
                />
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn-primary profile-hero__quick-upload"
            onClick={() => setQuickUploadOpen(true)}
          >
            <IconCamera size={18} />
            Quick upload
          </button>
        </div>

        <section className="category-grid">
          <h2 className="section-title">Review Categories</h2>
          <p className="page__subtitle category-grid__hint">
            Use quick upload above for a faster flow, or manage each category below in detail.
          </p>
          <div className="category-grid__list">
            {data.categories.map((row) => (
              <CategoryUploadCard
                key={row.category}
                category={row.category}
                drafts={row.drafts}
                submitted={row.submitted}
                complete={row.complete}
                uploading={uploadingCategory === row.category}
                submitting={submittingCategory === row.category}
                onUpload={handleUpload}
                onDelete={handleDelete}
                onSubmit={handleSubmit}
              />
            ))}
          </div>
        </section>
      </div>

      <QuickUploadSheet
        open={quickUploadOpen}
        student={{
          id: data.student.id,
          full_name: data.student.full_name,
          image: data.student.image,
        }}
        onClose={() => setQuickUploadOpen(false)}
        onSuccess={loadStudent}
      />
    </AppShell>
  )
}
