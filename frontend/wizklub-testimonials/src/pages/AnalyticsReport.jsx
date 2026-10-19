import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ClipboardCheck,
  Cpu,
  Layers,
  LogIn,
  PlayCircle,
} from 'lucide-react'
import { toast } from 'react-toastify'
import { api } from '../api/client'
import AppShell from '../components/layout/AppShell'
import PageHeader from '../components/ui/PageHeader'
import { IconRefresh } from '../components/icons/Icons'
import { useNavigate } from '../router'
import './pages.css'
import './AnalyticsReport.css'

function pctHeatClass(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 'ar-pct--na'
  if (n >= 80) return 'ar-pct--high'
  if (n >= 50) return 'ar-pct--mid'
  return 'ar-pct--low'
}

function sumTypeField(byType, field) {
  const by = byType || {}
  return (
    (Number(by.Lab?.[field]) || 0) +
    (Number(by.Lecture?.[field]) || 0) +
    (Number(by.Assessment?.[field]) || 0)
  )
}

function avgTypeField(byType, field) {
  const by = byType || {}
  const vals = ['Lab', 'Lecture', 'Assessment']
    .map((k) => Number(by[k]?.[field]))
    .filter((n) => Number.isFinite(n) && n > 0)
  if (!vals.length) return null
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

const EXECUTION_SESSION_TYPES = [
  { value: 'All', label: 'All' },
  { value: 'Lab', label: 'Lab' },
  { value: 'Lecture', label: 'Lec' },
  { value: 'Assessment', label: 'Assessment' },
]

function executionMetricsForType(byType, sessionType) {
  const by = byType || {}
  if (sessionType === 'Lab' || sessionType === 'Lecture' || sessionType === 'Assessment') {
    const slice = by[sessionType] || {}
    const planned = Number(slice.planned) || 0
    const conducted = Number(slice.conducted) || 0
    return {
      planned,
      conducted,
      delivery: Number(slice.delivery) || 0,
      completion: Number(slice.completion) || 0,
    }
  }
  const planned = sumTypeField(by, 'planned')
  const conducted = sumTypeField(by, 'conducted')
  return {
    planned,
    conducted,
    delivery: avgTypeField(by, 'delivery'),
    completion: null,
  }
}

const PANELS = [
  {
    id: 'login',
    title: 'Login - Not Login Details',
    hint: 'Go-live counts and student names who have not logged in',
    Icon: LogIn,
    tone: 'blue',
  },
  {
    id: 'execution',
    title: 'Execution Summary',
    hint: 'Lab, lecture and assessment sessions for the school',
    Icon: PlayCircle,
    tone: 'orange',
  },
  {
    id: 'batch',
    title: 'Batch Completion',
    hint: 'Syllabus and session completion batch-wise',
    Icon: Layers,
    tone: 'green',
  },
  {
    id: 'assessment',
    title: 'Assessment Report',
    hint: 'Applicable vs completed assessments by batch',
    Icon: ClipboardCheck,
    tone: 'purple',
  },
  {
    id: 'hardware',
    title: 'Hardware Usage',
    hint: 'Kit inventory, dispatch and usage',
    Icon: Cpu,
    tone: 'gold',
  },
]

function fmtPct(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return `${Number.isInteger(n) ? n : n.toFixed(1)}%`
}

function monthLabel() {
  return new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

export default function AnalyticsReport() {
  const navigate = useNavigate()
  const [schools, setSchools] = useState([])
  const [schoolId, setSchoolId] = useState('')
  const [loading, setLoading] = useState(true)
  const [activePanel, setActivePanel] = useState(null)
  const [loginSummary, setLoginSummary] = useState(null)
  const [notLoggedIn, setNotLoggedIn] = useState({ students: [], total: 0 })
  const [execution, setExecution] = useState(null)
  const [sessionType, setSessionType] = useState('All')
  const [executionSessionType, setExecutionSessionType] = useState('All')

  const loadSchoolData = useCallback(async (sid, schoolList) => {
    if (!sid) return
    setLoading(true)
    try {
      const schoolMeta = (schoolList || schools).find((s) => s.id === sid)
      const [login, notIn, exec] = await Promise.all([
        api.getSchoolLoginSummary(sid),
        api.getNotLoggedInStudents(sid),
        api.getSchoolExecutionCompletion(sid, { periodType: 'MONTHLY' }),
      ])
      if (login?.forbidden || notIn?.forbidden || exec?.forbidden) {
        toast.error('You do not have access to this school.')
        return
      }

      const loginBatches = Array.isArray(login?.batches) ? login.batches : []
      const batchStudentSum = loginBatches.reduce(
        (sum, b) => sum + (Number(b.student_count) || 0),
        0,
      )
      const notStudents = Array.isArray(notIn?.students) ? notIn.students : []
      const totalStudents =
        batchStudentSum ||
        Number(login?.total_students) ||
        Number(schoolMeta?.student_count) ||
        0
      const totalBatches =
        loginBatches.length || Number(login?.total_batches) || Number(schoolMeta?.batch_count) || 0
      const notInCount = notStudents.length || Number(notIn?.total) || Number(login?.not_logged_in) || 0

      setLoginSummary({
        ...login,
        school_name: login?.school_name || schoolMeta?.name || sid,
        total_batches: totalBatches,
        total_students: totalStudents,
        not_logged_in: notInCount,
        logged_in: Math.max(totalStudents - notInCount, 0),
        batches: loginBatches,
      })
      setNotLoggedIn({ students: notStudents, total: notInCount })
      setExecution(exec)
    } catch (e) {
      toast.error(e?.message || 'Failed to load analytics report')
    } finally {
      setLoading(false)
    }
  }, [schools])

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await api.getSchools()
      if (cancelled) return
      if (!list || list.forbidden || !Array.isArray(list) || list.length === 0) {
        setSchools([])
        setSchoolId('')
        setLoading(false)
        return
      }
      const mapped = list.map((s) => ({
        id: s.id,
        name: s.name || s.id,
        batch_count: Number(s.batch_count) || 0,
        student_count: Number(s.student_count) || 0,
      }))
      setSchools(mapped)
      const first = list[0].id
      setSchoolId((cur) => (mapped.some((s) => s.id === cur) ? cur : first))
      if (!mapped.length) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (schoolId && schools.length) loadSchoolData(schoolId, schools)
  }, [schoolId, schools, loadSchoolData])

  const totals = useMemo(() => {
    const loginBatches = Array.isArray(loginSummary?.batches) ? loginSummary.batches : []
    const totalBatches = loginBatches.length || Number(loginSummary?.total_batches) || 0
    const totalStudents =
      loginBatches.reduce((sum, b) => sum + (Number(b.student_count) || 0), 0) ||
      Number(loginSummary?.total_students) ||
      0
    const notIn =
      notLoggedIn.students.length ||
      Number(loginSummary?.not_logged_in) ||
      Number(notLoggedIn.total) ||
      0
    return {
      totalStudents,
      totalBatches,
      notIn,
      loggedIn: Math.max(totalStudents - notIn, 0),
    }
  }, [loginSummary, notLoggedIn])

  const batchRows = useMemo(() => {
    const rows = Array.isArray(execution?.batches) ? execution.batches : []
    return rows.map((row) => {
      const byType = row.by_type || {}
      const pick = (key) => byType[key] || {}
      const lab = pick('Lab')
      const lecture = pick('Lecture')
      const assess = pick('Assessment')
      if (sessionType === 'Lab') {
        return {
          ...row,
          planned: Number(lab.planned) || 0,
          conducted: Number(lab.conducted) || 0,
          pending: Math.max((Number(lab.planned) || 0) - (Number(lab.conducted) || 0), 0),
          completion_pct: Number(lab.completion) || 0,
          students_completed: Number(lab.completed) || 0,
        }
      }
      if (sessionType === 'Lecture') {
        return {
          ...row,
          planned: Number(lecture.planned) || 0,
          conducted: Number(lecture.conducted) || 0,
          pending: Math.max((Number(lecture.planned) || 0) - (Number(lecture.conducted) || 0), 0),
          completion_pct: Number(lecture.completion) || 0,
          students_completed: Number(lecture.completed) || 0,
        }
      }
      if (sessionType === 'Assessment') {
        return {
          ...row,
          planned: Number(assess.planned) || 0,
          conducted: Number(assess.conducted) || 0,
          pending: Math.max((Number(assess.planned) || 0) - (Number(assess.conducted) || 0), 0),
          completion_pct: Number(assess.completion) || 0,
          students_completed: Number(assess.completed) || 0,
        }
      }
      const planned =
        (Number(lab.planned) || 0) + (Number(lecture.planned) || 0) + (Number(assess.planned) || 0)
      const conducted =
        (Number(lab.conducted) || 0) +
        (Number(lecture.conducted) || 0) +
        (Number(assess.conducted) || 0)
      return {
        ...row,
        planned,
        conducted,
        pending: Math.max(planned - conducted, 0),
        completion_pct: Number(row.completion_pct) || 0,
        students_completed: Number(row.students_completed) || 0,
      }
    })
  }, [execution?.batches, sessionType])

  const executionByType = useMemo(() => {
    const rows = Array.isArray(execution?.batches) ? execution.batches : []
    const keys = ['Lab', 'Lecture', 'Assessment']
    const sum = {
      Lab: { planned: 0, conducted: 0 },
      Lecture: { planned: 0, conducted: 0 },
      Assessment: { planned: 0, conducted: 0 },
    }
    for (const row of rows) {
      const by = row.by_type || {}
      for (const key of keys) {
        sum[key].planned += Number(by[key]?.planned) || 0
        sum[key].conducted += Number(by[key]?.conducted) || 0
      }
    }
    return keys.map((key) => ({
      key,
      planned: sum[key].planned,
      conducted: sum[key].conducted,
      pending: Math.max(sum[key].planned - sum[key].conducted, 0),
      completion: sum[key].planned ? (sum[key].conducted / sum[key].planned) * 100 : 0,
    }))
  }, [execution?.batches])

  const schoolName =
    loginSummary?.school_name || schools.find((s) => s.id === schoolId)?.name || ''

  const batchExecutionRows = useMemo(() => {
    const rows = Array.isArray(execution?.batches) ? execution.batches : []
    return rows.map((row) => {
      const students = Number(row.student_count) || 0
      const by = row.by_type || {}
      const metrics = executionMetricsForType(by, executionSessionType)
      const plannedYtd = metrics.planned
      const conducted = metrics.conducted
      const scheduledStudentSlots = plannedYtd * students
      const teacherExecPct =
        plannedYtd > 0
          ? (conducted / plannedYtd) * 100
          : metrics.delivery ?? avgTypeField(by, 'delivery')
      const studentExecPct =
        metrics.completion ??
        Number(row.completion_pct) ??
        avgTypeField(by, 'completion') ??
        0
      const w = row.workouts || {}
      const workouts = {
        completed: Number(w.completed) || 0,
        inProgress: Number(w.in_progress ?? w.inProgress) || 0,
        notStarted: Number(w.not_started ?? w.notStarted) || 0,
      }
      return {
        batch_id: row.batch_id,
        batchName: row.batch_name || row.batch_id,
        students,
        totalScheduleYtd: plannedYtd,
        scheduleTillToday: plannedYtd,
        teacherCompletedSessions: conducted,
        scheduledStudentSlots,
        teacherExecPct,
        studentExecPct,
        workouts,
      }
    })
  }, [execution?.batches, executionSessionType])

  const panelMeta = useMemo(
    () => ({
      login: `${totals.loggedIn} logged in · ${totals.notIn} not logged in`,
      execution: execution?.session_summary
        ? `${execution.session_summary.done ?? 0} / ${execution.session_summary.total ?? 0} sessions`
        : 'Monthly execution',
      batch: `${batchRows.length} batches`,
      assessment: `${batchRows.length} batches`,
      hardware: 'Kit inventory',
    }),
    [totals, execution, batchRows.length],
  )

  function renderPanel() {
    if (!activePanel) return null

    switch (activePanel) {
      case 'login':
        return (
          <section className="ar-panel card">
            <h2 className="ar-panel__title">Login - Not Login Details</h2>
            <div className="ar-kpis">
              <article className="ar-kpi">
                <span>Total students</span>
                <strong>{totals.totalStudents}</strong>
              </article>
              <article className="ar-kpi">
                <span>Total batches</span>
                <strong>{totals.totalBatches}</strong>
              </article>
              <article className="ar-kpi ar-kpi--ok">
                <span>Logged in</span>
                <strong>{totals.loggedIn}</strong>
              </article>
              <article className="ar-kpi ar-kpi--warn">
                <span>Not logged in</span>
                <strong>{totals.notIn}</strong>
              </article>
            </div>
            <h3 className="ar-subtitle">Go-live by batch</h3>
            <Table
              headers={['Batch', 'Students', 'Not logged in', 'Logged in', 'Attendance %']}
              rows={(loginSummary?.batches || []).map((b) => {
                const total = Number(b.student_count) || 0
                const not = Number(b.not_logged_in_count) || 0
                return [
                  b.batch_name || b.batch_id,
                  total,
                  not,
                  Math.max(total - not, 0),
                  b.attendance_percentage != null ? fmtPct(b.attendance_percentage) : '—',
                ]
              })}
            />
            <h3 className="ar-subtitle">Students not logged in (names)</h3>
            {notLoggedIn.students.length === 0 ? (
              <p className="ar-muted">All students have logged in at least once.</p>
            ) : (
              <Table
                headers={['Batch', 'Student', 'Grade']}
                rows={notLoggedIn.students.map((s) => [
                  s.batch_name || s.batch_id,
                  s.full_name || s.id,
                  s.grade || '—',
                ])}
              />
            )}
          </section>
        )
      case 'execution':
        return (
          <section className="ar-panel card">
            <h2 className="ar-panel__title">Execution Summary</h2>
            <p className="ar-muted">
              School-wide lab, lecture and assessment — {monthLabel()}.{' '}
              {execution?.batch_scope?.label ||
                'Only batches with start date on or after 1 April 2026 (this academic year).'}
            </p>
            <div className="ar-kpis ar-kpis--compact">
              <article className="ar-kpi">
                <span>Sessions total</span>
                <strong>{execution?.session_summary?.total ?? 0}</strong>
              </article>
              <article className="ar-kpi ar-kpi--ok">
                <span>Sessions done</span>
                <strong>{execution?.session_summary?.done ?? 0}</strong>
              </article>
              <article className="ar-kpi">
                <span>Teacher execution %</span>
                <strong>{fmtPct(execution?.session_summary?.teacher_execution_pct)}</strong>
              </article>
            </div>
            <Table
              headers={['Type', 'Planned', 'Conducted', 'Pending', 'Completion %']}
              rows={executionByType.map((r) => [
                r.key,
                r.planned,
                r.conducted,
                r.pending,
                fmtPct(r.completion),
              ])}
            />
            <h3 className="ar-subtitle ar-subtitle--section">
              Batch-wise Session Execution &amp; Student Completion Details
            </h3>
            <p className="ar-muted">
              Overall data (not monthly only) · Same AY 2026 batch scope as the summary above (from 1 April 2026).
              Workout columns use the nightly health snapshot (platform submissions).
            </p>
            <p className="ar-type-tabs-label">View batch table by session type</p>
            <div className="ar-type-tabs" role="tablist" aria-label="Session type for batch table">
              {EXECUTION_SESSION_TYPES.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={executionSessionType === value}
                  className={`ar-type-tab${executionSessionType === value ? ' ar-type-tab--active' : ''}`}
                  onClick={() => setExecutionSessionType(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            {batchExecutionRows.length === 0 ? (
              <p className="ar-muted">No batch execution data for this school.</p>
            ) : (
              <ExecutionBatchTable rows={batchExecutionRows} />
            )}
          </section>
        )
      case 'batch':
        return (
          <section className="ar-panel card">
            <h2 className="ar-panel__title">Batch Completion</h2>
            <label className="ar-field">
              <span className="ar-field__label">Session type</span>
              <select
                className="ar-select"
                value={sessionType}
                onChange={(e) => setSessionType(e.target.value)}
              >
                <option value="All">All (Lab + Lecture + Assessment)</option>
                <option value="Lab">Lab</option>
                <option value="Lecture">Lecture</option>
                <option value="Assessment">Assessment</option>
              </select>
            </label>
            <Table
              headers={[
                'Batch',
                'Students',
                'Sessions done',
                'Sessions pending',
                'Completion %',
                'Students completed',
              ]}
              rows={batchRows.map((b) => [
                b.batch_name || b.batch_id,
                b.student_count,
                b.conducted,
                b.pending,
                fmtPct(b.completion_pct),
                b.students_completed,
              ])}
            />
          </section>
        )
      case 'assessment':
        return (
          <section className="ar-panel card">
            <h2 className="ar-panel__title">Assessment Report</h2>
            <p className="ar-muted">Assessment applicable (students) vs session completion aggregate by batch.</p>
            <Table
              headers={['Batch', 'Students (applicable)', 'Completed (aggregate)', 'Completion %']}
              rows={batchRows.map((b) => {
                const assess = b.by_type?.Assessment || {}
                return [
                  b.batch_name || b.batch_id,
                  b.student_count,
                  Number(assess.completed) || 0,
                  fmtPct(assess.completion),
                ]
              })}
            />
          </section>
        )
      case 'hardware':
        return (
          <section className="ar-panel card">
            <h2 className="ar-panel__title">Hardware Usage</h2>
            <p className="ar-muted">
              View kit dispatches, audits, and school-level hardware usage in Kit inventory (same data as Operations).
            </p>
            <button type="button" className="btn btn-primary" onClick={() => navigate('/inventory')}>
              Open kit inventory
            </button>
          </section>
        )
      default:
        return null
    }
  }

  return (
    <AppShell
      activeTab="analytics-report"
      showRefresh
      onRefresh={() => loadSchoolData(schoolId, schools)}
      className="page-analytics-report"
    >
      <PageHeader
        title="Analytics Report"
        subtitle={`${schoolName || 'Select a school'} · ${monthLabel()}`}
      />

      <div className="ar-toolbar card">
        <label className="ar-field">
          <span className="ar-field__label">School</span>
          <select
            className="ar-select"
            value={schoolId}
            onChange={(e) => {
              setActivePanel(null)
              setSchoolId(e.target.value)
            }}
          >
            {schools.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn btn-o btn-sm"
          onClick={() => loadSchoolData(schoolId, schools)}
        >
          <IconRefresh size={16} /> Refresh
        </button>
      </div>

      {loading ? (
        <p className="ar-muted">Loading analytics…</p>
      ) : (
        <>
          {!activePanel && (
            <div className="ar-grid" role="list">
              {PANELS.map(({ id, title, hint, Icon, tone }) => (
                <button
                  key={id}
                  type="button"
                  role="listitem"
                  className={`ar-tile ar-tile--${tone}`}
                  onClick={() => setActivePanel(id)}
                >
                  <span className="ar-tile__icon" aria-hidden>
                    <Icon size={26} strokeWidth={1.75} />
                  </span>
                  <span className="ar-tile__title">{title}</span>
                  <span className="ar-tile__hint">{hint}</span>
                  <span className="ar-tile__meta">{panelMeta[id]}</span>
                </button>
              ))}
            </div>
          )}

          {activePanel && (
            <div className="ar-detail">
              <button type="button" className="btn btn-o btn-sm ar-back" onClick={() => setActivePanel(null)}>
                ← All reports
              </button>
              {renderPanel()}
            </div>
          )}
        </>
      )}
    </AppShell>
  )
}

function ExecutionBatchTable({ rows }) {
  return (
    <div className="ar-exec-scroll">
      <table className="ar-table ar-table--exec">
        <thead>
          <tr>
            <th>Batch Name</th>
            <th>Total Student</th>
            <th>Total Schedule (YTD)</th>
            <th>Full Batches Schedule Till Today</th>
            <th>Teacher Completed Sessions</th>
            <th>Total Session × Total Student (Scheduled)</th>
            <th>Teacher Execution Rate %</th>
            <th>Student Execution Rate %</th>
            <th>Workout Submissions Completed</th>
            <th>Workout In Progress</th>
            <th>Workout Not Started</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.batch_id}>
              <td className="ar-cell-batch">{r.batchName}</td>
              <td>{r.students}</td>
              <td>{r.totalScheduleYtd}</td>
              <td>{r.scheduleTillToday}</td>
              <td>{r.teacherCompletedSessions}</td>
              <td>{r.scheduledStudentSlots}</td>
              <td className={`ar-pct ${pctHeatClass(r.teacherExecPct)}`}>
                {fmtPct(r.teacherExecPct)}
              </td>
              <td className={`ar-pct ${pctHeatClass(r.studentExecPct)}`}>
                {fmtPct(r.studentExecPct)}
              </td>
              <td>{r.workouts.completed}</td>
              <td>{r.workouts.inProgress}</td>
              <td>{r.workouts.notStarted}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Table({ headers, rows }) {
  if (!rows.length) {
    return <p className="ar-muted">No data for this school yet.</p>
  }
  return (
    <div className="ar-table-wrap">
      <table className="ar-table">
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i}>
              {cells.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
