import { memo, useMemo, useState } from 'react'
import { IconSearch } from '../icons/Icons'
import { bumpRenderCount } from '../../utils/conductPerf'
import StudentRow from './StudentRow'

/* Filter chips (design system Chip): one selected, navy fill. */
const FILTERS = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'waiting', label: 'Waiting', test: (s) => !s.captured && s.has_sr_card },
  { id: 'captured', label: 'Captured', test: (s) => Boolean(s.captured) },
  { id: 'missing', label: 'SR missing', test: (s) => !s.has_sr_card },
]

function ConductStudentList({ students, missingSrCardCount }) {
  bumpRenderCount('ConductStudentList')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.id, students.filter(f.test).length])),
    [students],
  )

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    const byFilter = (FILTERS.find((f) => f.id === filter) || FILTERS[0]).test
    return students.filter((student) => {
      if (!byFilter(student)) return false
      if (!query) return true
      const name = String(student.name || '').toLowerCase()
      const username = String(student.username || student.student_id || '').toLowerCase()
      return name.includes(query) || username.includes(query)
    })
  }, [students, search, filter])

  return (
    <section className="ac-card ac-students" aria-labelledby="ac-students-title">
      <div className="ac-students__head">
        <h2 className="ac-section-title" id="ac-students-title">
          Students
        </h2>
        <p className="ac-students__sub">
          {students.length} enrolled
          {missingSrCardCount > 0 ? ` · ${missingSrCardCount} without an SR card` : ''}
        </p>
      </div>

      <div className="ac-search">
        <IconSearch className="ac-search__icon" size={18} />
        <input
          type="search"
          className="ac-search__input"
          placeholder="Search by student name…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search students"
        />
      </div>

      <div className="ac-chips" role="radiogroup" aria-label="Filter students">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="radio"
            aria-checked={filter === f.id}
            className={`ac-chip${filter === f.id ? ' is-active' : ''}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
            <span className="ac-chip__count">{counts[f.id]}</span>
          </button>
        ))}
      </div>

      {students.length === 0 ? (
        <div className="ac-empty">
          <p className="ac-empty__title">No students</p>
          <p className="ac-empty__text">This batch has no enrolled students yet.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="ac-empty">
          <p className="ac-empty__title">No matches</p>
          <p className="ac-empty__text">Try a different search or filter.</p>
        </div>
      ) : (
        <ul className="ac-students__list">
          {filtered.map((student) => (
            <StudentRow key={student.student_id || student.username} student={student} />
          ))}
        </ul>
      )}
    </section>
  )
}

function listPropsAreEqual(prev, next) {
  return prev.missingSrCardCount === next.missingSrCardCount && prev.students === next.students
}

export default memo(ConductStudentList, listPropsAreEqual)
