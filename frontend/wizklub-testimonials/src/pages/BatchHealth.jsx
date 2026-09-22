import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, CalendarCheck, ChevronsUpDown, Download, FlaskConical, Search, Target, Users, X } from 'lucide-react'
import { api } from '../api/client'
import AppShell from '../components/layout/AppShell'
import { BandBar, BandPill, HealthAvatar, HealthEmpty, HealthSkeleton } from '../components/health/HealthUi'
import {
  FILTERS,
  attendanceText,
  bandOf,
  batchHealthPath,
  batchStudentsPath,
  downloadText,
  formatDate,
  formatRelative,
  heldAssessmentIds,
  num,
  isPendingAssessment,
  outcomesText,
  pendingAssessmentCount,
  participationText,
  rosterCsv,
  sortStudents,
  studentHealthPath,
} from '../lib/health'
import { useNavigate } from '../router'
import '../styles/app.css'
import './pages.css'
import './health.css'

const QUICK_FILTERS = ['all', 'overall:R', 'participation:not_started', 'pending_assessment', 'login:never']

const COLUMNS = [
  { key: 'name', label: 'Student' },
  { key: 'overall', label: 'Overall' },
  { key: 'participation', label: 'Participation' },
  { key: 'outcomes', label: 'Outcomes' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'last_active', label: 'Last active' },
]

function readFilterFromUrl() {
  const value = new URLSearchParams(window.location.search).get('filter') || 'all'
  return FILTERS[value] ? value : 'all'
}

function SortHeader({ col, sort, onSort }) {
  const active = sort.key === col.key
  const Icon = !active ? ChevronsUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <th scope="col" aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className={`hsort ${active ? 'is-active' : ''}`} onClick={() => onSort(col.key)}>
        {col.label}
        <Icon size={14} aria-hidden />
      </button>
    </th>
  )
}

export default function BatchHealth({ batchId, schoolId = '' }) {
  const navigate = useNavigate()
  const [state, setState] = useState({ status: 'loading' })
  const [filter, setFilterState] = useState(readFilterFromUrl)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState({ key: 'overall', dir: 'asc' })

  const [reloadKey, setReloadKey] = useState(0)
  const load = useCallback(() => {
    setState({ status: 'loading' })
    setReloadKey((k) => k + 1)
  }, [])

  useEffect(() => {
    let alive = true
    api.getBatchHealth(batchId).then((result) => {
      if (!alive) return
      if (!result) setState({ status: 'error' })
      else if (result.forbidden) setState({ status: 'forbidden' })
      else setState({ status: 'ready', data: result })
    })
    return () => {
      alive = false
    }
  }, [batchId, reloadKey])

  const setFilter = useCallback(
    (next) => {
      const value = FILTERS[next] ? next : 'all'
      setFilterState(value)
      // Keep the URL shareable / back-button friendly without re-mounting the page.
      const url = `${(import.meta.env.BASE_URL || '/').replace(/\/$/, '')}${batchHealthPath(batchId, schoolId, value)}`
      window.history.replaceState({}, '', url)
    },
    [batchId, schoolId],
  )

  const data = state.data
  const students = useMemo(() => data?.students ?? [], [data])
  const heldIds = useMemo(() => heldAssessmentIds(students), [students])

  const rows = useMemo(() => {
    const test = FILTERS[filter]?.test ?? FILTERS.all.test
    const q = search.trim().toLowerCase()
    const filtered = students.filter(
      (s) => test(s, { heldIds }) && (!q || String(s.name).toLowerCase().includes(q) || String(s.username).toLowerCase().includes(q)),
    )
    return sortStudents(filtered, sort.key, sort.dir)
  }, [students, filter, search, sort, heldIds])

  const onSort = (key) =>
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))

  const batchName = data?.batch?.batch_name || students[0]?.batch_name || 'Batch'
  const shell = (children) => (
    <AppShell topBarVariant="back" activeTab="schools" className="page-health">
      {children}
    </AppShell>
  )

  const header = (
    <div className="page page--with-header">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span>Schools</span>
        <span className="breadcrumb__sep">›</span>
        <span>{data?.batch?.school_name || 'Batch'}</span>
        <span className="breadcrumb__sep">›</span>
        <span className="breadcrumb__active">{batchName}</span>
      </nav>
      <div className="health-title-row">
        <div>
          <h1 className="page__title">Batch health</h1>
          <p className="page__subtitle">
            {data?.run
              ? `Year to date · data as of ${formatDate(data.run.data_as_of, { withYear: true })}`
              : 'Participation, outcomes and attendance for every student'}
          </p>
        </div>
        {data?.batch && <BandPill band={data.batch.overall_band} size="lg">{`Batch ${bandLabel(data.batch.overall_band)}`}</BandPill>}
      </div>
      <div className="chip-row batch-page-tabs" role="tablist" aria-label="Batch views">
        <button type="button" role="tab" aria-selected="false" className="chip" onClick={() => navigate(batchStudentsPath(batchId, schoolId))}>
          Students
        </button>
        <button
          type="button"
          role="tab"
          aria-selected="false"
          className="chip"
          onClick={() => navigate(`${batchStudentsPath(batchId, schoolId)}?view=assessments`)}
        >
          Assessments
        </button>
        <button type="button" role="tab" aria-selected="true" className="chip chip--active">
          Health
        </button>
      </div>
    </div>
  )

  if (state.status === 'loading') return shell(<HealthSkeleton />)

  if (state.status === 'error' || state.status === 'forbidden') {
    return shell(
      <div className="health-page">
        {header}
        <HealthEmpty
          title={state.status === 'forbidden' ? 'You do not have access to this batch' : 'Could not load batch health'}
          text={state.status === 'forbidden' ? 'Ask your WizKlub coordinator if this batch should be assigned to you.' : 'Check your connection and try again.'}
          action={
            state.status === 'error' && (
              <button type="button" className="btn-primary dash-retry" onClick={load}>
                Try again
              </button>
            )
          }
        />
      </div>,
    )
  }

  if (!data.run) {
    return shell(
      <div className="health-page">
        {header}
        <HealthEmpty
          title="Health data not available yet"
          text="Student health is refreshed from a nightly snapshot. It will appear here after the first run."
        />
      </div>,
    )
  }

  if (!students.length) {
    return shell(
      <div className="health-page">
        {header}
        <HealthEmpty
          title="This batch isn't in the latest snapshot"
          text="Only batches that started this academic year (from 1 April) are included. New batches appear after the next nightly run."
        />
      </div>,
    )
  }

  const batch = data.batch ?? {}
  const delivery = batch.delivery ?? {}
  const count = (pillar, b) => students.filter((s) => bandOf(s[pillar]?.band) === b).length
  const pCounts = { G: count('participation', 'G'), A: count('participation', 'A'), R: count('participation', 'R'), N: count('participation', 'N') }
  const oCounts = { G: count('outcomes', 'G'), A: count('outcomes', 'A'), R: count('outcomes', 'R'), N: count('outcomes', 'N') }
  const notStarted = students.filter((s) => s.participation?.not_started).length
  const neverLoggedIn = students.filter((s) => s.login && !s.login.ever_logged_in).length
  const pendingAssessment = students.filter((s) => isPendingAssessment(s, heldIds)).length
  const [activePillar, activeBand] = filter.includes(':') ? filter.split(':') : [null, null]

  const exportCsv = () => {
    const safe = String(batchName).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()
    downloadText(`batch-health-${safe || batchId}-${data.run.data_as_of || 'latest'}.csv`, rosterCsv(rows, { heldIds }))
  }

  return shell(
    <div className="health-page animate-in">
      {header}

      {batch.reasons?.length > 0 && (
        <p className="health-why">
          <strong>Why</strong>
          {batch.reasons.join(' · ')}
        </p>
      )}

      <section className="dash-kpis" aria-label="Batch health headline numbers">
        <article className="stat-card stat-card--brand">
          <div className="stat-card__top">
            <span className="stat-card__label">Students</span>
            <span className="stat-card__icon-wrap"><Users size={15} /></span>
          </div>
          <p className="stat-card__value">{students.length}</p>
          <p className="stat-card__hint">
            {neverLoggedIn ? (
              <button type="button" className="hlink" onClick={() => setFilter('login:never')}>
                {neverLoggedIn} never logged in
              </button>
            ) : (
              'All have logged in'
            )}
          </p>
        </article>

        <article className="stat-card stat-card--purple">
          <div className="stat-card__top">
            <span className="stat-card__label">Classes held</span>
            <span className="stat-card__icon-wrap"><CalendarCheck size={15} /></span>
          </div>
          <p className="stat-card__value">
            {delivery.scheduled ? (
              <>
                {delivery.held}
                <span className="stat-card__of"> / {delivery.scheduled}</span>
              </>
            ) : (
              'Not measured'
            )}
          </p>
          <p className="stat-card__hint">
            <BandPill band={delivery.band} size="sm">
              {delivery.scheduled ? `Delivery ${num(delivery.pct)}%` : 'No classes scheduled'}
            </BandPill>
          </p>
        </article>

        <button type="button" className="stat-card stat-card--danger hkpi-btn" onClick={() => setFilter('participation:R')}>
          <span className="stat-card__top">
            <span className="stat-card__label">Red on participation</span>
            <span className="stat-card__icon-wrap"><FlaskConical size={15} /></span>
          </span>
          <span className="stat-card__value">{pCounts.R}</span>
          <span className="stat-card__hint">
            {notStarted ? `incl. ${notStarted} not started` : 'Workouts below 40% done'}
          </span>
        </button>

        <button type="button" className="stat-card stat-card--danger hkpi-btn" onClick={() => setFilter('outcomes:R')}>
          <span className="stat-card__top">
            <span className="stat-card__label">Red on outcomes</span>
            <span className="stat-card__icon-wrap"><Target size={15} /></span>
          </span>
          <span className="stat-card__value">{oCounts.R}</span>
          <span className="stat-card__hint">
            {pendingAssessment ? `${pendingAssessment} pending an assessment` : 'Assessments + code runs below 40'}
          </span>
        </button>
      </section>

      <section className="health-card health-bars" aria-label="Band distribution">
        <BandBar
          title="Participation"
          caption={batch.participation?.completion_pct != null ? `${num(batch.participation.completion_pct)}% of workouts done` : 'Workouts done ÷ due'}
          counts={pCounts}
          activeBand={activePillar === 'participation' ? activeBand : null}
          onSelect={(b) => setFilter(filter === `participation:${b}` ? 'all' : `participation:${b}`)}
          extra={notStarted ? { R: `${notStarted} not started` } : {}}
        />
        <BandBar
          title="Outcomes"
          caption="50% assessments · 50% code runs"
          counts={oCounts}
          activeBand={activePillar === 'outcomes' ? activeBand : null}
          onSelect={(b) => setFilter(filter === `outcomes:${b}` ? 'all' : `outcomes:${b}`)}
        />
      </section>

      <section className="health-card health-roster" aria-labelledby="roster-title">
        <div className="health-roster__head">
          <div>
            <h2 id="roster-title" className="section-title">Students</h2>
            <p className="health-roster__count">
              Showing {rows.length} of {students.length}
              {filter !== 'all' && ` · ${FILTERS[filter].label}`}
            </p>
          </div>
          <button type="button" className="btn-outline health-export" onClick={exportCsv} disabled={!rows.length}>
            <Download size={16} aria-hidden /> Export CSV
          </button>
        </div>

        <div className="health-toolbar">
          <label className="health-search">
            <Search size={16} aria-hidden />
            <input
              type="search"
              placeholder="Search students…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search students"
            />
          </label>
          <select className="health-select" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter by band">
            {Object.entries(FILTERS).map(([key, f]) => (
              <option key={key} value={key}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        <div className="chip-row health-quick" aria-label="Quick filters">
          {QUICK_FILTERS.map((key) => {
            const n =
              key === 'all' ? students.length
              : key === 'overall:R' ? students.filter((s) => s.overall_band === 'R').length
              : key === 'participation:not_started' ? notStarted
              : key === 'pending_assessment' ? pendingAssessment
              : neverLoggedIn
            return (
              <button
                key={key}
                type="button"
                className={`chip ${filter === key ? 'chip--active' : ''}`}
                onClick={() => setFilter(filter === key && key !== 'all' ? 'all' : key)}
              >
                {key === 'all' ? 'All' : key === 'overall:R' ? 'Red' : FILTERS[key].label} <span className="chip__n">{n}</span>
              </button>
            )
          })}
          {filter !== 'all' && !QUICK_FILTERS.includes(filter) && (
            <button type="button" className="chip chip--active" onClick={() => setFilter('all')}>
              {FILTERS[filter].label} <X size={14} aria-label="Clear filter" />
            </button>
          )}
        </div>

        {rows.length === 0 ? (
          <HealthEmpty title="No students match" text="Try a different search or filter." />
        ) : (
          <>
            <div className="health-table-wrap">
              <table className="health-table">
                <thead>
                  <tr>
                    {COLUMNS.map((col) => (
                      <SortHeader key={col.key} col={col} sort={sort} onSort={onSort} />
                    ))}
                    <th scope="col">
                      <span className="sr-only">Report</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => {
                    const href = studentHealthPath(batchId, s.username, schoolId)
                    return (
                      <tr key={s.username}>
                        <td>
                          <button type="button" className="hstudent" onClick={() => navigate(href)}>
                            <HealthAvatar name={s.name} size={36} />
                            <span>
                              <span className="hstudent__name">{s.name}</span>
                              <span className="hstudent__meta">
                                {pendingLabel(s, heldIds) || s.username}
                              </span>
                            </span>
                          </button>
                        </td>
                        <td><BandPill band={s.overall_band} size="sm" /></td>
                        <td>
                          <span className="hcell">
                            <BandPill band={s.participation?.band} size="sm">{s.participation?.not_started ? 'Not started' : undefined}</BandPill>
                            <span className="hcell__sub">{participationSub(s.participation)}</span>
                          </span>
                        </td>
                        <td>
                          <span className="hcell">
                            <BandPill band={s.outcomes?.band} size="sm" />
                            <span className="hcell__sub">{bandOf(s.outcomes?.band) === 'N' ? 'No scores yet' : outcomesText(s.outcomes)}</span>
                          </span>
                        </td>
                        <td className={s.attendance?.band === 'R' ? 'hnum hnum--bad' : 'hnum'}>{attendanceText(s.attendance)}</td>
                        <td className="hmuted">{s.last_active_at ? formatRelative(s.last_active_at, data.run.data_as_of) : s.login?.ever_logged_in === false ? 'Never logged in' : '—'}</td>
                        <td className="hright">
                          <button type="button" className="hview" onClick={() => navigate(href)}>
                            View report
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <ul className="health-cards" aria-label="Students">
              {rows.map((s) => {
                const href = studentHealthPath(batchId, s.username, schoolId)
                return (
                  <li key={s.username}>
                    <button type="button" className="hmcard" onClick={() => navigate(href)}>
                      <span className="hmcard__top">
                        <HealthAvatar name={s.name} size={40} />
                        <span className="hmcard__id">
                          <span className="hstudent__name">{s.name}</span>
                          <span className="hstudent__meta">
                            Last active: {s.last_active_at ? formatRelative(s.last_active_at, data.run.data_as_of) : s.login?.ever_logged_in === false ? 'never logged in' : '—'}
                          </span>
                        </span>
                        <BandPill band={s.overall_band} size="sm" />
                      </span>
                      <span className="hmcard__grid">
                        <span>
                          <span className="hmcard__label">Participation</span>
                          <span className={`hmcard__val hband-text--${bandOf(s.participation?.band)}`}>{participationText(s.participation)}</span>
                        </span>
                        <span>
                          <span className="hmcard__label">Outcomes</span>
                          <span className={`hmcard__val hband-text--${bandOf(s.outcomes?.band)}`}>{outcomesText(s.outcomes)}</span>
                        </span>
                        <span>
                          <span className="hmcard__label">Attendance</span>
                          <span className={`hmcard__val hband-text--${bandOf(s.attendance?.band)}`}>{attendanceText(s.attendance)}</span>
                        </span>
                      </span>
                      {pendingLabel(s, heldIds) && <span className="hmcard__flag">{pendingLabel(s, heldIds)}</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </section>
    </div>,
  )
}

function pendingLabel(s, heldIds) {
  const n = pendingAssessmentCount(s, heldIds)
  return n > 0 ? `${n} assessment${n === 1 ? '' : 's'} pending` : ''
}

function participationSub(p) {
  if (!p) return ''
  const labs = `${p.lab_sessions_held ?? 0} session${p.lab_sessions_held === 1 ? '' : 's'} due`
  if (p.not_started || bandOf(p.band) === 'N') return labs
  return participationText(p)
}

function bandLabel(b) {
  return { G: 'Green', A: 'Amber', R: 'Red', N: 'not measured' }[bandOf(b)]
}
