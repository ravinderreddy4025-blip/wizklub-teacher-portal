import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarCheck, ClipboardCheck, FlaskConical, Lightbulb, Terminal } from 'lucide-react'
import { api } from '../api/client'
import AppShell from '../components/layout/AppShell'
import { BandPill, HealthAvatar, HealthEmpty, HealthSkeleton } from '../components/health/HealthUi'
import {
  BAND_META,
  PRODIGY_STRANDS,
  bandOf,
  batchHealthPath,
  firstName,
  formatDate,
  formatRelative,
  gradeLabel,
  num,
  participationText,
  pendingAssessmentCount,
  suggestedSteps,
} from '../lib/health'
import { useNavigate } from '../router'
import '../styles/app.css'
import './pages.css'
import './health.css'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'classes', label: 'Classes' },
  { id: 'assessments', label: 'Assessments' },
  { id: 'activity', label: 'Activity' },
]

const KIND_LABEL = { lab: 'Lab', lecture: 'Lecture', assessment: 'Assessment', other: 'Other' }

function classState(c) {
  const status = String(c.status || '').toUpperCase()
  if (status === 'CANCELLED') return { key: 'cancelled', label: 'Cancelled' }
  if (c.present === true) return { key: 'present', label: 'Present' }
  if (c.present === false) return { key: 'absent', label: 'Absent' }
  if (status === 'SCHEDULED') return { key: 'scheduled', label: 'Scheduled' }
  if (status === 'IN_PROGRESS') return { key: 'scheduled', label: 'In progress' }
  return { key: 'unmarked', label: 'Not marked' }
}

function pctBand(pct, green = 60, amber = 40) {
  if (pct == null) return 'N'
  return pct >= green ? 'G' : pct >= amber ? 'A' : 'R'
}

function Meter({ value, band }) {
  return (
    <span className="hmeter" aria-hidden>
      <span className={`hmeter__fill hmeter__fill--${bandOf(band)}`} style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }} />
    </span>
  )
}

function Tile({ tone, icon: Icon, label, value, sub, band }) {
  return (
    <article className="htile">
      <span className={`htile__art tone-${tone}`} aria-hidden>
        <Icon size={20} strokeWidth={1.9} />
      </span>
      <span className="htile__label">{label}</span>
      <span className="htile__value">{value}</span>
      <span className="htile__sub">
        {band && band !== 'N' && <BandPill band={band} size="sm" />}
        {sub}
      </span>
    </article>
  )
}

function ClassDots({ classes }) {
  return (
    <div className="hdots" role="img" aria-label="Classes this year: present, absent and cancelled">
      {classes.map((c) => {
        const st = classState(c)
        return <span key={c.session_id || c.date} className={`hdot hdot--${st.key}`} title={`${formatDate(c.date)} · ${c.session_name} · ${st.label}`} />
      })}
    </div>
  )
}

function Heatmap({ activity, asOf }) {
  const end = new Date(`${String(asOf || new Date().toISOString()).slice(0, 10)}T00:00:00`)
  const byDate = new Map((activity ?? []).map((a) => [a.date, a.events]))
  // 13 weeks ending on the week that contains `end`; columns = weeks (Mon-first), rows = weekdays.
  const endDow = (end.getDay() + 6) % 7
  const start = new Date(end)
  start.setDate(end.getDate() - endDow - 12 * 7)
  const weeks = []
  for (let w = 0; w < 13; w += 1) {
    const days = []
    for (let d = 0; d < 7; d += 1) {
      const day = new Date(start)
      day.setDate(start.getDate() + w * 7 + d)
      const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
      const events = byDate.get(key) ?? 0
      const level = day > end ? -1 : events === 0 ? 0 : events < 4 ? 1 : events < 9 ? 2 : events < 15 ? 3 : 4
      days.push({ key, events, level, month: day.getDate() <= 7 && d === 0 ? day.toLocaleDateString('en-IN', { month: 'short' }) : '' })
    }
    weeks.push(days)
  }
  return (
    <div className="hheat">
      <div className="hheat__grid" role="img" aria-label={`Active on ${activity?.length ?? 0} days in the last 90 days`}>
        <div className="hheat__days" aria-hidden>
          {['Mon', '', 'Wed', '', 'Fri', '', ''].map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
        {weeks.map((days, wi) => (
          <div key={wi} className="hheat__col">
            <span className="hheat__month" aria-hidden>{days[0].month}</span>
            {days.map((d) => (
              <span
                key={d.key}
                className={`hheat__cell hheat__cell--${d.level}`}
                title={d.level < 0 ? '' : `${formatDate(d.key)} · ${d.events ? `${d.events} events` : 'no activity'}`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="hheat__legend" aria-hidden>
        Less
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} className={`hheat__cell hheat__cell--${l}`} />
        ))}
        More
      </div>
    </div>
  )
}

export default function StudentHealth({ batchId, username, schoolId = '' }) {
  const navigate = useNavigate()
  const [state, setState] = useState({ status: 'loading' })
  const [tab, setTab] = useState('overview')

  const [reloadKey, setReloadKey] = useState(0)
  const load = useCallback(() => {
    setState({ status: 'loading' })
    setReloadKey((k) => k + 1)
  }, [])

  useEffect(() => {
    let alive = true
    api.getStudentHealth(batchId, username).then((result) => {
      if (!alive) return
      if (!result) setState({ status: 'error' })
      else if (result.forbidden) setState({ status: 'forbidden' })
      else setState({ status: 'ready', data: result })
    })
    return () => {
      alive = false
    }
  }, [batchId, username, reloadKey])

  const data = state.data
  const student = data?.student
  const detail = data?.detail
  const classes = useMemo(() => [...(detail?.classes ?? [])].sort((a, b) => String(a.date).localeCompare(String(b.date))), [detail])

  // Scored assessments come from outcomes (the builder decides which sessions count as assessments).
  const assessmentRows = useMemo(
    () => [...(student?.outcomes?.assessments ?? [])].sort((a, b) => String(a.date).localeCompare(String(b.date))),
    [student],
  )
  const upcomingAssessments = useMemo(
    () => classes.filter((c) => c.kind === 'assessment' && String(c.status).toUpperCase() === 'SCHEDULED'),
    [classes],
  )

  const shell = (children) => (
    <AppShell topBarVariant="back" activeTab="schools" className="page-health">
      {children}
    </AppShell>
  )

  const crumbs = (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      <span>Schools</span>
      <span className="breadcrumb__sep">›</span>
      <button type="button" className="hcrumb" onClick={() => navigate(batchHealthPath(batchId, schoolId))}>
        {data?.batch?.batch_name || 'Batch'} health
      </button>
      <span className="breadcrumb__sep">›</span>
      <span className="breadcrumb__active">{student?.name || 'Student'}</span>
    </nav>
  )

  if (state.status === 'loading') return shell(<HealthSkeleton rows={3} />)

  if (state.status !== 'ready' || !data.run || !student) {
    const title =
      state.status === 'forbidden' ? 'You do not have access to this student'
      : state.status === 'error' ? 'Could not load the student report'
      : !data?.run ? 'Health data not available yet'
      : 'This student isn’t in the latest snapshot'
    const text =
      state.status === 'error' ? 'Check your connection and try again.'
      : state.status === 'forbidden' ? 'Ask your WizKlub coordinator if this batch should be assigned to you.'
      : !data?.run ? 'Student health is refreshed from a nightly snapshot. It will appear here after the first run.'
      : 'New students appear after the next nightly run.'
    return shell(
      <div className="health-page">
        <div className="page page--with-header">{crumbs}</div>
        <HealthEmpty
          title={title}
          text={text}
          action={
            state.status === 'error' ? (
              <button type="button" className="btn-primary dash-retry" onClick={load}>Try again</button>
            ) : (
              <button type="button" className="btn-outline dash-retry" onClick={() => navigate(batchHealthPath(batchId, schoolId))}>
                Back to batch health
              </button>
            )
          }
        />
      </div>,
    )
  }

  const p = student.participation ?? {}
  const o = student.outcomes ?? {}
  const a = student.attendance ?? {}
  const asOf = data.run.data_as_of
  const pending = pendingAssessmentCount(student)
  const steps = suggestedSteps(student, { pendingAssessments: pending })
  const batch = data.batch ?? {}
  const workoutsValue = p.not_started ? 'Not started' : p.band === 'N' || !p.due ? 'Not measured' : `${p.done} / ${p.due}`
  const sessionsDue = `${p.lab_sessions_held ?? 0} session${p.lab_sessions_held === 1 ? '' : 's'} due`

  return shell(
    <div className="health-page animate-in">
      <div className="page page--with-header">{crumbs}</div>

      <section className="health-card hhead" aria-label="Student">
        <div className="hhead__top">
          <HealthAvatar name={student.name} size={56} />
          <div className="hhead__id">
            <h1 className="hhead__name">{student.name}</h1>
            <p className="hhead__meta">
              {[
                String(batch.batch_name || '').toLowerCase().includes(gradeLabel(student.grade).toLowerCase()) ? null : gradeLabel(student.grade),
                batch.batch_name,
                batch.school_name,
              ].filter(Boolean).join(' · ')}
            </p>
          </div>
          <BandPill band={student.overall_band} size="lg">
            {bandOf(student.overall_band) === 'N' ? 'Not measured' : `${BAND_META[bandOf(student.overall_band)].label} overall`}
          </BandPill>
        </div>
        {student.reasons?.length > 0 && (
          <p className={`health-why health-why--${bandOf(student.overall_band)}`}>
            <strong>Why</strong>
            {student.reasons.join(' · ')}
          </p>
        )}
      </section>

      <section className="hnext" aria-label="Suggested next step">
        <span className="hnext__icon" aria-hidden><Lightbulb size={20} /></span>
        <div>
          <p className="hnext__title">Suggested next step</p>
          {steps.map((s) => (
            <p key={s} className="hnext__text">{s}</p>
          ))}
        </div>
      </section>

      <section className="htiles" aria-label="Highlights">
        <Tile
          tone="blue"
          icon={CalendarCheck}
          label="Attendance"
          value={a.band === 'N' || a.pct == null ? 'Not measured' : `${num(a.pct)}%`}
          sub={a.held ? `${a.present} of ${a.held} classes` : 'Fewer than 3 classes held'}
          band={a.band}
        />
        <Tile
          tone="orange"
          icon={FlaskConical}
          label="Workouts done"
          value={workoutsValue}
          sub={p.not_started ? sessionsDue : p.pct != null && p.band !== 'N' ? `${num(p.pct)}% done` : `Only ${sessionsDue}`}
          band={p.band}
        />
        <Tile
          tone="purple"
          icon={ClipboardCheck}
          label="Assessment average"
          value={o.avg_assessment_pct == null ? 'Not measured' : `${num(o.avg_assessment_pct)}%`}
          sub={`${o.assessments_taken ?? 0} taken${pending ? ` · ${pending} pending` : ''}`}
          band={pctBand(o.avg_assessment_pct)}
        />
        <Tile
          tone="green"
          icon={Terminal}
          label="Code runs OK"
          value={o.code_runs_total ? `${o.code_runs_ok} / ${o.code_runs_total}` : 'Not measured'}
          sub={o.code_run_pct != null ? `${num(o.code_run_pct)}% succeeded` : 'No coding exercises yet'}
          band={pctBand(o.code_run_pct)}
        />
      </section>

      <div className="chip-row htabs" role="tablist" aria-label="Report sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`chip ${tab === t.id ? 'chip--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="hstack">
          <section className="hpillars" aria-label="Pillars">
            <article className="health-card hpillar">
              <div className="hpillar__head">
                <h2 className="hpillar__title">Participation</h2>
                <BandPill band={p.band} size="sm">{p.not_started ? 'Not started' : undefined}</BandPill>
              </div>
              <p className="hpillar__big">{participationText(p)}</p>
              {!p.not_started && p.band !== 'N' && <Meter value={p.pct} band={p.band} />}
              <p className="hpillar__sub">Workouts submitted ÷ due across {sessionsDue}</p>
            </article>
            <article className="health-card hpillar">
              <div className="hpillar__head">
                <h2 className="hpillar__title">Outcomes</h2>
                <BandPill band={o.band} size="sm" />
              </div>
              <p className="hpillar__big">{o.score == null ? 'Not measured' : `Score ${num(o.score)}`}</p>
              {o.score != null && <Meter value={o.score} band={o.band} />}
              <p className="hpillar__sub">
                Assessments {o.avg_assessment_pct == null ? 'not taken' : `${num(o.avg_assessment_pct)}%`} · code runs{' '}
                {o.code_run_pct == null ? 'none yet' : `${num(o.code_run_pct)}%`}
              </p>
            </article>
            <article className="health-card hpillar">
              <div className="hpillar__head">
                <h2 className="hpillar__title">Activity</h2>
                <BandPill band={student.login?.ever_logged_in ? (student.active_days_30 >= 4 ? 'G' : student.active_days_30 >= 1 ? 'A' : 'R') : 'R'} size="sm">
                  {student.login?.ever_logged_in
                    ? `${student.active_days_30 ?? 0} active day${student.active_days_30 === 1 ? '' : 's'}`
                    : 'Never logged in'}
                </BandPill>
              </div>
              <p className="hpillar__big">
                {student.last_active_at ? formatRelative(student.last_active_at, asOf) : 'No activity yet'}
              </p>
              <p className="hpillar__sub">
                Last active · {student.active_days_30 ?? 0} active days in the last 30
                {student.login?.last_login_at ? ` · last login ${formatDate(student.login.last_login_at)}` : ''}
              </p>
            </article>
          </section>

          <section className="health-card" aria-labelledby="h-classes-strip">
            <div className="hsec-head">
              <h2 id="h-classes-strip" className="section-title">Classes this year</h2>
              <button type="button" className="link-btn" onClick={() => setTab('classes')}>View all</button>
            </div>
            {classes.length ? (
              <>
                <ClassDots classes={classes} />
                <p className="hlegend">
                  <span><i className="hdot hdot--present" /> Present</span>
                  <span><i className="hdot hdot--absent" /> Absent</span>
                  <span><i className="hdot hdot--cancelled" /> Cancelled</span>
                  <span><i className="hdot hdot--scheduled" /> Scheduled</span>
                  <span><i className="hdot hdot--unmarked" /> Not marked</span>
                </p>
              </>
            ) : (
              <p className="hmuted">No classes recorded yet.</p>
            )}
          </section>
        </div>
      )}

      {tab === 'classes' && (
        <section className="health-card" aria-label="Class by class">
          {classes.length === 0 ? (
            <p className="hmuted">No classes recorded yet.</p>
          ) : (
            <ol className="htimeline">
              {[...classes].reverse().map((c) => {
                const st = classState(c)
                return (
                  <li key={c.session_id || c.date} className={`htl htl--${st.key}`}>
                    <span className="htl__date">{formatDate(c.date)}</span>
                    <span className="htl__body">
                      <span className="htl__name">{c.session_name}</span>
                      <span className="htl__meta">
                        <span className={`hkind hkind--${c.kind}`}>{KIND_LABEL[c.kind] ?? 'Class'}</span>
                        {c.workouts_total > 0 && (
                          <span>
                            {c.workouts_done} / {c.workouts_total} workouts
                          </span>
                        )}
                      </span>
                    </span>
                    <span className={`hstatus hstatus--${st.key}`}>{st.label}</span>
                  </li>
                )
              })}
            </ol>
          )}
        </section>
      )}

      {tab === 'assessments' && (
        <div className="hstack">
          <section className="health-card" aria-label="Assessments">
            <h2 className="section-title hsec-title">Assessments</h2>
            {pending > 0 && (
              <p className="hpending">
                <strong>{pending}</strong> assessment{pending === 1 ? '' : 's'} that batch-mates have taken{' '}
                {pending === 1 ? 'is' : 'are'} still pending for {firstName(student.name)}.
              </p>
            )}
            {assessmentRows.length === 0 ? (
              <p className="hmuted">No scored assessments yet.</p>
            ) : (
              <ul className="hlist">
                {assessmentRows.map((r) => (
                  <li key={r.session_id} className="hlist__row">
                    <span className="hlist__main">
                      <span className="hlist__name">{r.name}</span>
                      <span className="hlist__meta">{formatDate(r.date, { withYear: true })}</span>
                    </span>
                    <span className="hlist__score">
                      {num(r.score)} / {num(r.max)}
                    </span>
                    <BandPill band={pctBand(r.pct)} size="sm">{`${num(r.pct)}%`}</BandPill>
                  </li>
                ))}
              </ul>
            )}
            {upcomingAssessments.length > 0 && (
              <p className="hpillar__sub">
                Scheduled, not yet held: {upcomingAssessments.map((c) => c.session_name).join(', ')}.
              </p>
            )}
            <p className="hpillar__sub">
              Coding exercises: {o.code_runs_total ? `${o.code_runs_ok} of ${o.code_runs_total} ran successfully (${num(o.code_run_pct)}%)` : 'none yet'}.
              Outcomes score = 50% assessment average + 50% coding success.
            </p>
          </section>

          {detail?.prodigy && (
            <section className="health-card" aria-label="Prodigy strands">
              <h2 className="section-title hsec-title">Prodigy test — strands</h2>
              <ul className="hstrands">
                {Object.entries(PRODIGY_STRANDS).map(([code, label]) => {
                  const v = detail.prodigy[code]
                  if (v == null) return null
                  const b = pctBand(v)
                  return (
                    <li key={code}>
                      <span className="hstrands__label">{label}</span>
                      <Meter value={v} band={b} />
                      <span className="hstrands__val">{num(v)}%</span>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
        </div>
      )}

      {tab === 'activity' && (
        <section className="health-card" aria-label="Activity">
          <div className="hsec-head">
            <h2 className="section-title">Active days · last 90 days</h2>
            <span className="hmuted">{detail?.activity?.length ?? 0} active days</span>
          </div>
          {student.login?.ever_logged_in === false ? (
            <p className="hmuted">{firstName(student.name)} has never logged in this academic year.</p>
          ) : null}
          <Heatmap activity={detail?.activity} asOf={asOf} />
          <dl className="hfacts">
            <div><dt>Last active</dt><dd>{student.last_active_at ? formatDate(student.last_active_at, { withYear: true }) : '—'}</dd></div>
            <div><dt>Last login</dt><dd>{student.login?.last_login_at ? formatDate(student.login.last_login_at, { withYear: true }) : 'Never'}</dd></div>
            <div><dt>Active days (30)</dt><dd>{student.active_days_30 ?? 0}</dd></div>
          </dl>
        </section>
      )}
    </div>,
  )
}
