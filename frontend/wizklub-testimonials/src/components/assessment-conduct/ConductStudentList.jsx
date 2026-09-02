import { memo, useMemo, useState } from 'react'
import { IconSearch } from '../icons/Icons'
import { bumpRenderCount } from '../../utils/conductPerf'
import StudentRow from './StudentRow'

function ConductStudentList({ students, missingSrCardCount }) {
  bumpRenderCount('ConductStudentList')
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return students
    return students.filter((student) => {
      const name = String(student.name || '').toLowerCase()
      const username = String(student.username || student.student_id || '').toLowerCase()
      return name.includes(query) || username.includes(query)
    })
  }, [students, search])

  return (
    <section className="conduct-students">
      <div className="conduct-students__header">
        <div>
          <h2 className="conduct-students__title">Students</h2>
          <p className="conduct-students__subtitle">
            {students.length} enrolled
            {missingSrCardCount > 0 ? ` · ${missingSrCardCount} missing SR cards` : ''}
          </p>
        </div>
      </div>

      <div className="search-input-wrap" style={{ marginBottom: 10 }}>
        <IconSearch className="search-icon" size={16} />
        <input
          type="search"
          className="search-input"
          placeholder="Search students…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search students"
        />
      </div>

      {students.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state__title">No students</p>
          <p className="empty-state__text">This batch has no enrolled students yet.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state__title">No matches</p>
          <p className="empty-state__text">Try a different search term.</p>
        </div>
      ) : (
        <div className="conduct-students__list">
          {filtered.map((student) => (
            <StudentRow key={student.student_id || student.username} student={student} />
          ))}
        </div>
      )}
    </section>
  )
}

function listPropsAreEqual(prev, next) {
  return (
    prev.missingSrCardCount === next.missingSrCardCount &&
    prev.students === next.students
  )
}

export default memo(ConductStudentList, listPropsAreEqual)
