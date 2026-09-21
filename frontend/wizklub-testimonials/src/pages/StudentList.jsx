import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'
import { BATCH_GROUP_PHOTO_LABEL } from '../api/constants'
import GroupPhotoSheet from '../components/GroupPhotoSheet'
import '../components/GroupPhotoSheet.css'
import QuickUploadSheet from '../components/QuickUploadSheet'
import AppShell from '../components/layout/AppShell'
import LoadingScreen from '../components/ui/LoadingScreen'
import { IconCamera, IconChevronRight, IconDownload, IconSearch, IconUpload } from '../components/icons/Icons'
import { useNavigate } from '../router'
import '../styles/app.css'
import './pages.css'

const filters = ['all', 'uploaded', 'pending']
const pageViews = [
  { id: 'students', label: 'Students' },
  { id: 'assessments', label: 'Assessments' },
]

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

function formatAssessmentDate(value) {
  if (!value) return 'Not scheduled'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not scheduled'
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatAssessmentStatus(status) {
  const normalized = String(status || '').trim().toUpperCase()
  if (!normalized) return 'Unknown'
  return normalized
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ')
}

function assessmentStatusClass(status) {
  const normalized = String(status || '').trim().toUpperCase()
  if (normalized === 'COMPLETED' || normalized === 'DONE') return 'assessment-status--done'
  if (normalized === 'IN_PROGRESS' || normalized === 'STARTED') return 'assessment-status--active'
  return 'assessment-status--pending'
}

function Avatar({ image, name, size = 40 }) {
  if (image) return <img src={image} alt="" />
  const initials = getInitials(name)
  const bg = getInitialsColor(name)
  return (
    <div
      style={{
        width: size, height: size, borderRadius: 8, background: bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontWeight: 700, fontSize: size * 0.38, letterSpacing: 0.5,
      }}
    >
      {initials}
    </div>
  )
}

function CompletionRing({ value }) {
  return (
    <div className="completion-ring" style={{ '--progress': value }}>
      <div className="completion-ring__inner">{value}%</div>
    </div>
  )
}


const SR_BULK_LIMIT = 200

function studentSrId(student) {
  return String(student?.username || student?.id || '').trim()
}

export default function StudentList({ batchId, schoolId: schoolIdProp = '' }) {
  const navigate = useNavigate()
  const [schoolIdFromQuery] = useState(
    () => new URLSearchParams(window.location.search).get('school_id') ?? '',
  )
  const schoolId = schoolIdProp || schoolIdFromQuery
  const [pageView, setPageView] = useState(() => {
    const view = new URLSearchParams(window.location.search).get('view')
    return view === 'assessments' ? 'assessments' : 'students'
  })
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [data, setData] = useState(null)
  const [assessments, setAssessments] = useState(null)
  const [assessmentsError, setAssessmentsError] = useState('')
  const [assessmentsLoading, setAssessmentsLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [uploadStudent, setUploadStudent] = useState(null)
  const [fabPickerOpen, setFabPickerOpen] = useState(false)
  const [groupPhotoOpen, setGroupPhotoOpen] = useState(false)
  const [selectedSrIds, setSelectedSrIds] = useState(() => new Set())
  const [srBusy, setSrBusy] = useState('')
  const [srMessage, setSrMessage] = useState('')
  const [srError, setSrError] = useState('')

  const loadStudents = useCallback(() => {
    setLoadError('')
    return api.getStudents(batchId, filter, schoolId).then((result) => {
      if (!result) {
        setLoadError('Unable to load students for this batch.')
        setData({ batch: { id: batchId, name: batchId }, students: [] })
        return
      }
      if (result.forbidden) {
        setLoadError('You do not have access to this batch.')
        setData({ batch: { id: batchId, name: batchId }, students: [] })
        return
      }
      setData(result)
    })
  }, [batchId, filter, schoolId])

  const loadAssessments = useCallback(() => {
    setAssessmentsLoading(true)
    setAssessmentsError('')
    return api.getBatchAssessments(batchId).then((result) => {
      setAssessmentsLoading(false)
      if (!result) {
        setAssessmentsError('Unable to load assessments for this batch.')
        setAssessments({ batch_id: batchId, sessions: [] })
        return
      }
      if (result.forbidden) {
        setAssessmentsError('You do not have access to this batch.')
        setAssessments({ batch_id: batchId, sessions: [] })
        return
      }
      setAssessments(result)
    })
  }, [batchId])

  useEffect(() => {
    loadStudents()
  }, [loadStudents])

  useEffect(() => {
    if (pageView !== 'assessments' || assessments !== null || assessmentsLoading) return
    loadAssessments()
  }, [pageView, assessments, assessmentsLoading, loadAssessments])

  if (!data) {
    return (
      <AppShell topBarVariant="back" activeTab="schools" className="page-students">
        <LoadingScreen message="Loading students…" />
      </AppShell>
    )
  }

  const filtered = data.students.filter((student) =>
    student.full_name.toLowerCase().includes(search.toLowerCase()),
  )

  const sheetOpen = Boolean(uploadStudent) || fabPickerOpen
  const showStudents = pageView === 'students'
  const assessmentSessions = (assessments?.sessions ?? []).filter(
    (session) => session?.type === 'assessment' && session?.is_scannable !== false,
  )

  const selectedCount = selectedSrIds.size
  const visibleIds = filtered.map(studentSrId).filter(Boolean)
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedSrIds.has(id))

  function toggleStudentSelected(studentId) {
    if (!studentId) return
    setSelectedSrIds((prev) => {
      const next = new Set(prev)
      if (next.has(studentId)) next.delete(studentId)
      else next.add(studentId)
      return next
    })
    setSrError('')
    setSrMessage('')
  }

  function selectAllVisible() {
    const next = new Set(selectedSrIds)
    for (const id of visibleIds) {
      if (next.size >= SR_BULK_LIMIT) break
      next.add(id)
    }
    setSelectedSrIds(next)
    setSrError('')
    if (visibleIds.length > SR_BULK_LIMIT) {
      setSrMessage(`Selected the first ${SR_BULK_LIMIT} students (API limit).`)
    } else {
      setSrMessage('')
    }
  }

  function clearSelection() {
    setSelectedSrIds(new Set())
    setSrError('')
    setSrMessage('')
  }

  async function handleBulkGenerate() {
    const ids = Array.from(selectedSrIds)
    if (!ids.length) {
      setSrError('Select at least one student.')
      return
    }
    setSrBusy('generate')
    setSrError('')
    setSrMessage('')
    try {
      const result = await api.bulkGenerateSrCodes(ids)
      if (result?.forbidden) {
        setSrError('You do not have permission to generate SR Codes.')
        return
      }
      if (!result?.ok) {
        setSrError(result?.error || 'Failed to generate SR Codes.')
        return
      }
      const succeeded = Number(result.data?.succeeded ?? 0)
      const failed = Number(result.data?.failed ?? 0)
      setSrMessage(
        `Generated ${succeeded} of ${ids.length} SR Code${ids.length === 1 ? '' : 's'}` +
          (failed ? ` (${failed} failed).` : '.'),
      )
    } catch (err) {
      setSrError(err?.message || 'Failed to generate SR Codes.')
    } finally {
      setSrBusy('')
    }
  }

  async function handleBulkDownload() {
    const ids = Array.from(selectedSrIds)
    if (!ids.length) {
      setSrError('Select at least one student.')
      return
    }
    setSrBusy('download')
    setSrError('')
    setSrMessage('')
    try {
      const result = await api.bulkDownloadSrCards(ids)
      if (result?.forbidden) {
        setSrError('You do not have permission to download SR cards.')
        return
      }
      if (!result?.ok) {
        setSrError(result?.error || 'Failed to download SR cards.')
        return
      }
      setSrMessage(`Downloaded ZIP for ${ids.length} student${ids.length === 1 ? '' : 's'}.`)
    } catch (err) {
      setSrError(err?.message || 'Failed to download SR cards.')
    } finally {
      setSrBusy('')
    }
  }

  return (
    <AppShell
      topBarVariant="back"
      showFab={showStudents}
      fabIcon="camera"
      onFabClick={() => setFabPickerOpen(true)}
      activeTab="schools"
      className="page-students"
    >
      <div className="animate-in">
        <div className="page page--with-header">
          <nav className="breadcrumb">
            <span>Schools</span>
            <span className="breadcrumb__sep">›</span>
            <span className="breadcrumb__active">{data.batch.name}</span>
          </nav>
          <h1 className="page__title">{showStudents ? 'Students' : 'Assessments'}</h1>
          {showStudents ? (
            loadError ? (
              <p className="page__subtitle" style={{ color: '#b45309' }}>{loadError}</p>
            ) : (
              <p className="page__subtitle" style={{ fontSize: 12, marginBottom: 4 }}>
                Upload group photo / video or tap a student camera for individual media.
              </p>
            )
          ) : (
            <p className="page__subtitle" style={{ fontSize: 12, marginBottom: 4 }}>
              Batch assessment sessions from the curriculum schedule.
            </p>
          )}
        </div>

        <div className="chip-row batch-page-tabs">
          {pageViews.map((view) => (
            <button
              key={view.id}
              type="button"
              className={`chip ${pageView === view.id ? 'chip--active' : ''}`}
              onClick={() => {
                setPageView(view.id)
                const params = new URLSearchParams(window.location.search)
                if (view.id === 'assessments') {
                  params.set('view', 'assessments')
                } else {
                  params.delete('view')
                }
                const query = params.toString()
                const next = `${window.location.pathname}${query ? `?${query}` : ''}`
                window.history.replaceState({}, '', next)
              }}
            >
              {view.label}
            </button>
          ))}
        </div>

        {showStudents ? (
          <>
            <section className="group-photo-card" aria-label={BATCH_GROUP_PHOTO_LABEL}>
              <div className="group-photo-card__header">
                <h2 className="group-photo-card__title">{BATCH_GROUP_PHOTO_LABEL}</h2>
              </div>

              <div className="group-photo-card__actions">
                <button
                  type="button"
                  className="group-photo-card__btn group-photo-card__btn--camera"
                  onClick={() => setGroupPhotoOpen(true)}
                >
                  <IconCamera size={16} />
                  Add / View Media
                </button>
              </div>
            </section>


            <section className="sr-code-card" aria-label="SR Codes">
              <div className="sr-code-card__header">
                <div>
                  <h2 className="sr-code-card__title">SR Codes</h2>
                  <p className="sr-code-card__meta">
                    Generate printable cards for selected students (max {SR_BULK_LIMIT}).
                  </p>
                </div>
              </div>

              <div className="sr-code-card__select-row">
                <p className="sr-code-card__meta" style={{ margin: 0 }}>
                  {selectedCount} selected
                </p>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button
                    type="button"
                    className="sr-code-card__link"
                    onClick={allVisibleSelected ? clearSelection : selectAllVisible}
                    disabled={Boolean(srBusy) || visibleIds.length === 0}
                  >
                    {allVisibleSelected ? 'Clear' : 'Select all'}
                  </button>
                  {selectedCount > 0 && !allVisibleSelected ? (
                    <button
                      type="button"
                      className="sr-code-card__link"
                      onClick={clearSelection}
                      disabled={Boolean(srBusy)}
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="sr-code-card__actions">
                <button
                  type="button"
                  className="sr-code-card__btn sr-code-card__btn--primary"
                  onClick={handleBulkGenerate}
                  disabled={Boolean(srBusy) || selectedCount === 0}
                >
                  <IconUpload size={16} />
                  {srBusy === 'generate' ? 'Generating…' : 'Generate'}
                </button>
                <button
                  type="button"
                  className="sr-code-card__btn sr-code-card__btn--secondary"
                  onClick={handleBulkDownload}
                  disabled={Boolean(srBusy) || selectedCount === 0}
                >
                  <IconDownload size={16} />
                  {srBusy === 'download' ? 'Downloading…' : 'Download ZIP'}
                </button>
              </div>

              {srError ? (
                <p className="sr-code-card__message sr-code-card__message--error">{srError}</p>
              ) : srMessage ? (
                <p className="sr-code-card__message">{srMessage}</p>
              ) : null}
            </section>

            <div className="sticky-filters">
              <div className="search-input-wrap">
                <IconSearch className="search-icon" />
                <input
                  type="search"
                  className="search-input"
                  placeholder="Search by student name…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="chip-row">
                {filters.map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={`chip ${filter === f ? 'chip--active' : ''}`}
                    onClick={() => setFilter(f)}
                  >
                    {f === 'all' ? 'All' : f === 'uploaded' ? 'Uploaded' : 'Pending'}
                  </button>
                ))}
              </div>
            </div>

            <div className="student-list">
              {filtered.length === 0 ? (
                <div className="empty-state">
                  <p className="empty-state__title">No students found</p>
                  <p className="empty-state__text">Try a different filter or search term.</p>
                </div>
              ) : (
                filtered.map((student) => {
                  const srId = studentSrId(student)
                  const isSelected = srId ? selectedSrIds.has(srId) : false
                  return (
                  <div key={student.id} className="list-row-wrap list-row-wrap--selectable">
                    <label className="list-row__select" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={!srId || Boolean(srBusy)}
                        onChange={() => toggleStudentSelected(srId)}
                        aria-label={`Select ${student.full_name} for SR Code`}
                      />
                    </label>
                    <button
                      type="button"
                      className="list-row list-row__main"
                      onClick={() => navigate(`/students/${student.id}`)}
                    >
                      <div className="list-row__avatar">
                        <Avatar image={student.image} name={student.full_name} size={40} />
                      </div>
                      <div className="list-row__info">
                        <p className="list-row__name">{student.full_name}</p>
                        <p className="list-row__meta">
                          Roll {student.roll_number} · {student.categories_done}/{student.categories_total}{' '}
                          categories
                        </p>
                      </div>
                      <div className="list-row__right">
                        <CompletionRing value={student.completion_pct} />
                        <span className="chevron-btn" aria-hidden="true">
                          <IconChevronRight size={12} />
                        </span>
                      </div>
                    </button>
                    <button
                      type="button"
                      className="list-row__upload-btn"
                      aria-label={`Quick upload for ${student.full_name}`}
                      onClick={() => {
                        setFabPickerOpen(false)
                        setUploadStudent(student)
                      }}
                    >
                      <IconCamera size={18} />
                    </button>
                  </div>
                  )
                })
              )}
            </div>
          </>
        ) : assessmentsLoading && !assessments ? (
          <LoadingScreen message="Loading assessments…" />
        ) : (
          <div className="assessment-list">
            {assessmentsError ? (
              <p className="page__subtitle" style={{ color: '#b45309', marginBottom: 12 }}>
                {assessmentsError}
              </p>
            ) : null}
            {assessmentSessions.length === 0 ? (
              <div className="empty-state">
                <p className="empty-state__title">No assessments found</p>
                <p className="empty-state__text">
                  This batch has no assessment sessions in the curriculum schedule.
                </p>
              </div>
            ) : (
              assessmentSessions.map((session) => {
                const sessionId = String(session.session_id || '').trim()
                const conductPath = schoolId
                  ? `/schools/${schoolId}/batches/${batchId}/assessments/${sessionId}`
                  : `/batches/${batchId}/assessments/${sessionId}`
                const appBase = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
                const conductHref = `${appBase}${conductPath}`
                return (
                  <a
                    key={sessionId || session.title}
                    href={conductHref}
                    className="assessment-card assessment-card--clickable"
                    onClick={(event) => {
                      event.preventDefault()
                      if (!sessionId) return
                      navigate(conductPath)
                    }}
                  >
                    <div className="assessment-card__main">
                      <p className="assessment-card__title">{session.title}</p>
                      <p className="assessment-card__meta">
                        {formatAssessmentDate(session.scheduled_date)}
                        {session.duration ? ` · ${session.duration} min` : ''}
                      </p>
                    </div>
                    <span className={`assessment-status ${assessmentStatusClass(session.status)}`}>
                      {formatAssessmentStatus(session.status)}
                    </span>
                    <IconChevronRight className="assessment-card__chevron" size={18} />
                  </a>
                )
              })
            )}
          </div>
        )}
      </div>

      <QuickUploadSheet
        open={sheetOpen}
        student={uploadStudent}
        students={fabPickerOpen && !uploadStudent ? filtered : []}
        onClose={() => {
          setUploadStudent(null)
          setFabPickerOpen(false)
        }}
        onSuccess={loadStudents}
      />

      <GroupPhotoSheet
        open={groupPhotoOpen}
        batchId={batchId}
        batchName={data.batch.name}
        onClose={() => setGroupPhotoOpen(false)}
        onSuccess={loadStudents}
      />
    </AppShell>
  )
}
