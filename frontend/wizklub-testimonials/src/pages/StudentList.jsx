import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'
import { BATCH_GROUP_PHOTO_LABEL } from '../api/constants'
import GroupPhotoSheet from '../components/GroupPhotoSheet'
import QuickUploadSheet from '../components/QuickUploadSheet'
import AppShell from '../components/layout/AppShell'
import LoadingScreen from '../components/ui/LoadingScreen'
import { IconCamera, IconChevronRight, IconSearch, IconUpload } from '../components/icons/Icons'
import { useNavigate } from '../router'
import '../styles/app.css'
import './pages.css'

const filters = ['all', 'uploaded', 'pending']

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

export default function StudentList({ batchId }) {
  const navigate = useNavigate()
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [data, setData] = useState(null)
  const [uploadStudent, setUploadStudent] = useState(null)
  const [fabPickerOpen, setFabPickerOpen] = useState(false)
  const [groupPhotoOpen, setGroupPhotoOpen] = useState(false)

  const loadStudents = useCallback(() => {
    return api.getStudents(batchId, filter).then(setData)
  }, [batchId, filter])

  useEffect(() => {
    loadStudents()
  }, [loadStudents])

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

  return (
    <AppShell
      topBarVariant="back"
      showFab
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
          <h1 className="page__title">Students</h1>
          <p className="page__subtitle" style={{ fontSize: 12, marginBottom: 4 }}>
            Upload group photo / video or tap a student camera for individual media.
          </p>
        </div>

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
            filtered.map((student) => (
              <div key={student.id} className="list-row-wrap">
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
            ))
          )}
        </div>
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
