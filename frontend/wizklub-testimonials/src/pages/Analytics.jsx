import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-toastify'
import { api } from '../api/client'
import AppShell from '../components/layout/AppShell'
import PageHeader from '../components/ui/PageHeader'
import {
  IconDownload,
  IconMore,
  IconRefresh,
  IconStar,
  IconVideo,
  IconWarning,
} from '../components/icons/Icons'
import { useNavigate } from '../router'
import './pages.css'
import './Analytics.css'

const EMPTY_SESSIONS = { total: 0, done: 0, missed: 0, cancelled: 0 }
const EMPTY_RATING = { overall: 0, forms: 0, grades: [] }
const EMPTY_NORTH_STAR = { count: 0, avatars: [], extra: 0 }
const EMPTY_TECH_ISSUES = { total: 0, open: 0, inProgress: 0, closed: 0 }
const EMPTY_COMPLETION = [
  { label: 'Practical Lab Sessions', delivery: 0, completion: 0 },
  { label: 'Theory & Lectures', delivery: 0, completion: 0 },
  { label: 'Monthly Assessments', delivery: 0, completion: 0 },
]
const EMPTY_STUDENTS = []

function formatLmsMinutes(totalMinutes) {
  const minutes = Math.max(0, Math.round(Number(totalMinutes) || 0))
  const hours = Math.floor(minutes / 60)
  const rem = minutes % 60
  if (hours === 0) return `${rem}m`
  if (rem === 0) return `${hours}h`
  return `${hours}h ${rem}m`
}

function LmsMonthChart({ points }) {
  const [hoverIndex, setHoverIndex] = useState(null)
  const series = Array.isArray(points) ? points : []
  if (series.length === 0) {
    return <p className="analytics-lms__empty">No LMS activity this month</p>
  }

  const width = 340
  const height = 128
  const pad = { top: 12, right: 14, bottom: 26, left: 22 }
  const plotW = width - pad.left - pad.right
  const plotH = height - pad.top - pad.bottom
  const maxMinutes = Math.max(...series.map((p) => Number(p.minutes) || 0), 1)
  const yMax = Math.ceil(maxMinutes / 30) * 30 || 30
  const yTicks = [0, yMax / 2, yMax]
  const n = series.length
  const xAt = (i) => pad.left + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW)
  const yAt = (minutes) => pad.top + plotH - ((Number(minutes) || 0) / yMax) * plotH
  const bandW = n > 1 ? plotW / (n - 1) : plotW

  /** Week labels with month abbrev; full range also in tooltip. */
  const axisLabel = (label) => {
    const text = String(label || '').trim()
    // Already like "Jul 6–12" or "Jun 29–Jul 5" from backend
    if (/^[A-Za-z]{3} \d+–/.test(text)) return text
    return text.length > 14 ? text.slice(0, 14) : text
  }

  const xAnchor = (index) => {
    if (index === 0) return 'start'
    if (index === n - 1) return 'end'
    return 'middle'
  }

  const linePoints = series.map((p, i) => `${xAt(i)},${yAt(p.minutes)}`).join(' ')
  const areaPoints = [
    `${xAt(0)},${pad.top + plotH}`,
    ...series.map((p, i) => `${xAt(i)},${yAt(p.minutes)}`),
    `${xAt(n - 1)},${pad.top + plotH}`,
  ].join(' ')

  const hovered = hoverIndex != null ? series[hoverIndex] : null

  return (
    <div className="analytics-lms-chart" onMouseLeave={() => setHoverIndex(null)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="analytics-lms-chart__svg"
        role="img"
        aria-label="LMS time by week this month"
      >
        <text
          x={pad.left}
          y={10}
          className="analytics-lms-chart__axis-title"
          fontSize="5.5"
        >
          ↑ Min
        </text>
        {yTicks.map((tick) => {
          const y = yAt(tick)
          return (
            <g key={`yt-${tick}`}>
              <line
                x1={pad.left}
                y1={y}
                x2={width - pad.right}
                y2={y}
                className="analytics-lms-chart__grid"
              />
              <text
                x={pad.left - 3}
                y={y + 2}
                textAnchor="end"
                className="analytics-lms-chart__tick"
                fontSize="5"
              >
                {tick}
              </text>
            </g>
          )
        })}
        {hoverIndex != null && (
          <rect
            x={Math.max(pad.left, xAt(hoverIndex) - bandW / 2)}
            y={pad.top}
            width={Math.min(bandW, width - pad.right - Math.max(pad.left, xAt(hoverIndex) - bandW / 2))}
            height={plotH}
            className="analytics-lms-chart__band"
          />
        )}
        <polygon points={areaPoints} className="analytics-lms-chart__area" />
        <polyline points={linePoints} className="analytics-lms-chart__line" fill="none" />
        {series.map((p, i) => (
          <g key={`pt-${p.start || p.label}-${i}`}>
            <circle
              cx={xAt(i)}
              cy={yAt(p.minutes)}
              r={hoverIndex === i ? 3 : 2.25}
              className={`analytics-lms-chart__dot${hoverIndex === i ? ' is-active' : ''}`}
            />
            <circle
              cx={xAt(i)}
              cy={yAt(p.minutes)}
              r={11}
              className="analytics-lms-chart__hit"
              onMouseEnter={() => setHoverIndex(i)}
              onFocus={() => setHoverIndex(i)}
            />
            <text
              x={xAt(i)}
              y={height - 7}
              textAnchor={xAnchor(i)}
              className="analytics-lms-chart__xlabel"
              fontSize="4"
            >
              {axisLabel(p.label)}
            </text>
          </g>
        ))}
      </svg>
      {hovered && hoverIndex != null && (
        <div
          className="analytics-lms-chart__tooltip"
          style={{
            left: `${(xAt(hoverIndex) / width) * 100}%`,
            top: `${(yAt(hovered.minutes) / height) * 100}%`,
          }}
        >
          <p className="analytics-lms-chart__tooltip-range">{hovered.label}</p>
          <p className="analytics-lms-chart__tooltip-value">
            Time spent: <strong>{formatLmsMinutes(hovered.minutes)}</strong>
          </p>
        </div>
      )}
    </div>
  )
}

const ANALYTICS_BY_BATCH = {
  g8a: {
    sessions: { total: 42, done: 28, missed: 10, cancelled: 4 },
    lmsHours: 48,
    weeklyBars: [38, 42, 35, 48, 52, 45, 70],
    techIssues: { total: 12, open: 3, inProgress: 4, closed: 5 },
    completion: [
      { label: 'Practical Lab Sessions', delivery: 85, completion: 72 },
      { label: 'Theory & Lectures', delivery: 78, completion: 64 },
      { label: 'Monthly Assessments', delivery: 92, completion: 81 },
    ],
    northStar: { count: 24, avatars: ['AS', 'MM', 'JD'], extra: 3 },
    students: [
      { rank: 1, name: 'Alex Johnson', score: 42, critical: true },
      { rank: 2, name: 'Sarah Miller', score: 45, critical: true },
      { rank: 3, name: 'Chris Evans', score: 51, critical: false },
      { rank: 4, name: 'Emma Watson', score: 53, critical: false },
    ],
    rating: {
      overall: 4.8,
      forms: 134,
      grades: [
        { grade: 'Grade 8', value: 4.9, tag: 'Highest', tone: 'high' },
        { grade: 'Grade 7', value: 4.7, tag: null, tone: 'mid' },
        { grade: 'Grade 9', value: 4.2, tag: 'Lowest', tone: 'low' },
      ],
    },
  },
  g8b: {
    sessions: { total: 38, done: 26, missed: 8, cancelled: 4 },
    lmsHours: 41,
    weeklyBars: [30, 36, 40, 44, 39, 48, 55],
    techIssues: { total: 9, open: 2, inProgress: 3, closed: 4 },
    completion: [
      { label: 'Practical Lab Sessions', delivery: 80, completion: 68 },
      { label: 'Theory & Lectures', delivery: 74, completion: 60 },
      { label: 'Monthly Assessments', delivery: 88, completion: 76 },
    ],
    northStar: { count: 18, avatars: ['RK', 'PL', 'TN'], extra: 2 },
    students: [
      { rank: 1, name: 'Noah Patel', score: 40, critical: true },
      { rank: 2, name: 'Mia Chen', score: 47, critical: true },
      { rank: 3, name: 'Liam Brooks', score: 52, critical: false },
      { rank: 4, name: 'Ava Sharma', score: 55, critical: false },
    ],
    rating: {
      overall: 4.6,
      forms: 98,
      grades: [
        { grade: 'Grade 8', value: 4.7, tag: 'Highest', tone: 'high' },
        { grade: 'Grade 7', value: 4.5, tag: null, tone: 'mid' },
        { grade: 'Grade 9', value: 4.1, tag: 'Lowest', tone: 'low' },
      ],
    },
  },
  g7a: {
    sessions: { total: 36, done: 24, missed: 9, cancelled: 3 },
    lmsHours: 39,
    weeklyBars: [28, 32, 34, 40, 36, 42, 50],
    techIssues: { total: 7, open: 1, inProgress: 2, closed: 4 },
    completion: [
      { label: 'Practical Lab Sessions', delivery: 76, completion: 61 },
      { label: 'Theory & Lectures', delivery: 82, completion: 70 },
      { label: 'Monthly Assessments', delivery: 84, completion: 73 },
    ],
    northStar: { count: 15, avatars: ['HS', 'VK', 'OR'], extra: 1 },
    students: [
      { rank: 1, name: 'Owen Reed', score: 44, critical: true },
      { rank: 2, name: 'Isla Kapoor', score: 49, critical: false },
      { rank: 3, name: 'Ethan Das', score: 54, critical: false },
      { rank: 4, name: 'Zoe Allen', score: 56, critical: false },
    ],
    rating: {
      overall: 4.5,
      forms: 87,
      grades: [
        { grade: 'Grade 7', value: 4.6, tag: 'Highest', tone: 'high' },
        { grade: 'Grade 8', value: 4.4, tag: null, tone: 'mid' },
        { grade: 'Grade 9', value: 4.0, tag: 'Lowest', tone: 'low' },
      ],
    },
  },
  g9a: {
    sessions: { total: 45, done: 31, missed: 11, cancelled: 3 },
    lmsHours: 52,
    weeklyBars: [40, 44, 48, 46, 55, 58, 72],
    techIssues: { total: 14, open: 4, inProgress: 5, closed: 5 },
    completion: [
      { label: 'Practical Lab Sessions', delivery: 90, completion: 78 },
      { label: 'Theory & Lectures', delivery: 86, completion: 71 },
      { label: 'Monthly Assessments', delivery: 94, completion: 85 },
    ],
    northStar: { count: 29, avatars: ['BT', 'NG', 'WL'], extra: 4 },
    students: [
      { rank: 1, name: 'Ryan Cole', score: 39, critical: true },
      { rank: 2, name: 'Priya Nair', score: 46, critical: true },
      { rank: 3, name: 'Jake Torres', score: 50, critical: false },
      { rank: 4, name: 'Nina Park', score: 57, critical: false },
    ],
    rating: {
      overall: 4.7,
      forms: 151,
      grades: [
        { grade: 'Grade 9', value: 4.8, tag: 'Highest', tone: 'high' },
        { grade: 'Grade 8', value: 4.6, tag: null, tone: 'mid' },
        { grade: 'Grade 7', value: 4.3, tag: 'Lowest', tone: 'low' },
      ],
    },
  },
}

function DonutChart({ done, missed, cancelled, total }) {
  const r = 54
  const c = 2 * Math.PI * r
  const safeTotal = total > 0 ? total : 1
  const doneLen = (done / safeTotal) * c
  const missedLen = (missed / safeTotal) * c
  const cancelledLen = (cancelled / safeTotal) * c

  return (
    <div className="analytics-donut" aria-hidden="true">
      <svg viewBox="0 0 140 140" className="analytics-donut__svg">
        <circle cx="70" cy="70" r={r} className="analytics-donut__track" />
        {total > 0 && (
          <>
            <circle
              cx="70"
              cy="70"
              r={r}
              className="analytics-donut__seg analytics-donut__seg--done"
              strokeDasharray={`${doneLen} ${c - doneLen}`}
              strokeDashoffset={0}
            />
            <circle
              cx="70"
              cy="70"
              r={r}
              className="analytics-donut__seg analytics-donut__seg--missed"
              strokeDasharray={`${missedLen} ${c - missedLen}`}
              strokeDashoffset={-doneLen}
            />
            <circle
              cx="70"
              cy="70"
              r={r}
              className="analytics-donut__seg analytics-donut__seg--cancelled"
              strokeDasharray={`${cancelledLen} ${c - cancelledLen}`}
              strokeDashoffset={-(doneLen + missedLen)}
            />
          </>
        )}
      </svg>
      <div className="analytics-donut__center">
        <strong>{total}</strong>
        <span>TOTAL</span>
      </div>
    </div>
  )
}

function DualProgress({ delivery, completion }) {
  return (
    <div className="analytics-dual-bar" aria-hidden="true">
      <div className="analytics-dual-bar__track">
        <div className="analytics-dual-bar__delivery" style={{ width: `${delivery}%` }} />
        <div className="analytics-dual-bar__completion" style={{ width: `${completion}%` }} />
      </div>
    </div>
  )
}

export default function Analytics() {
  const navigate = useNavigate()
  const [batches, setBatches] = useState([])
  const [batchId, setBatchId] = useState('')
  const [batchesReady, setBatchesReady] = useState(false)
  const [sessions, setSessions] = useState(EMPTY_SESSIONS)
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [lmsDisplay, setLmsDisplay] = useState('0m')
  const [lmsLabel, setLmsLabel] = useState(`Active in ${new Date().getFullYear()}`)
  const [lmsChartHint, setLmsChartHint] = useState('Each point is a week in the current month')
  const [monthPoints, setMonthPoints] = useState([])
  const [lmsLoading, setLmsLoading] = useState(true)
  const [rating, setRating] = useState(EMPTY_RATING)
  const [ratingLoading, setRatingLoading] = useState(true)
  const [northStar, setNorthStar] = useState(EMPTY_NORTH_STAR)
  const [northStarLoading, setNorthStarLoading] = useState(true)
  const [techIssues, setTechIssues] = useState(EMPTY_TECH_ISSUES)
  const [techIssuesLoading, setTechIssuesLoading] = useState(true)
  const [completion, setCompletion] = useState(EMPTY_COMPLETION)
  const [completionLoading, setCompletionLoading] = useState(true)
  const [students, setStudents] = useState(EMPTY_STUDENTS)
  const [studentsLoading, setStudentsLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  const selectedBatch = useMemo(
    () => batches.find((b) => b.id === batchId) || null,
    [batches, batchId],
  )

  const data = useMemo(
    () => ({
      sessions,
      lmsDisplay,
      monthPoints,
      rating,
      northStar,
      techIssues,
      completion,
      students,
    }),
    [sessions, lmsDisplay, monthPoints, rating, northStar, techIssues, completion, students],
  )

  useEffect(() => {
    let cancelled = false

    async function loadBatches() {
      try {
        const schools = await api.getSchools()
        if (!schools || schools.forbidden || !Array.isArray(schools) || schools.length === 0) {
          if (!cancelled) {
            setBatches([])
            setBatchId('')
            setBatchesReady(true)
          }
          return
        }

        const options = []
        for (const school of schools) {
          const result = await api.getBatches(school.id)
          if (!result || result.forbidden || !Array.isArray(result.batches)) continue
          for (const batch of result.batches) {
            options.push({
              id: batch.id,
              label: batch.name || batch.id,
              schoolId: school.id,
            })
          }
        }

        if (!cancelled) {
          setBatches(options)
          setBatchId((current) =>
            options.some((b) => b.id === current) ? current : options[0]?.id || '',
          )
          setBatchesReady(true)
        }
      } catch (err) {
        console.error('Failed to load analytics batches', err)
        if (!cancelled) {
          setBatches([])
          setBatchId('')
          setBatchesReady(true)
        }
      }
    }

    loadBatches()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadProgressOverview() {
      if (!batchesReady || !batchId || !selectedBatch?.schoolId) {
        if (batchesReady) {
          setSessions(EMPTY_SESSIONS)
          setSessionsLoading(false)
          setCompletion(EMPTY_COMPLETION)
          setCompletionLoading(false)
          setStudents(EMPTY_STUDENTS)
          setStudentsLoading(false)
        }
        return
      }
      setSessionsLoading(true)
      setCompletionLoading(true)
      setStudentsLoading(true)
      try {
        const summary = await api.getProgressOverview(batchId, {
          periodType: 'MONTHLY',
          limit: 10,
        })
        if (cancelled) return
        if (!summary || summary.forbidden) {
          setSessions(EMPTY_SESSIONS)
          setCompletion(EMPTY_COMPLETION)
          setStudents(EMPTY_STUDENTS)
          return
        }

        const session = summary.session_summary || {}
        setSessions({
          total: Number(session.total) || 0,
          done: Number(session.done) || 0,
          missed: Number(session.missed) || 0,
          cancelled: Number(session.cancelled) || 0,
        })

        const completionSummary = summary.completion_tracker || {}
        setCompletion(
          Array.isArray(completionSummary.items)
            ? completionSummary.items.map((item) => ({
                label: item.label || '',
                delivery: Number(item.delivery) || 0,
                completion: Number(item.completion) || 0,
              }))
            : EMPTY_COMPLETION,
        )

        const studentsSummary = summary.assessment_analysis || {}
        setStudents(
          Array.isArray(studentsSummary.items)
            ? studentsSummary.items.map((item) => ({
                rank: Number(item.rank) || 0,
                name: item.name || item.student_id || '',
                score: Number(item.score) || 0,
                critical: Boolean(item.critical),
              }))
            : EMPTY_STUDENTS,
        )
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load progress overview', err)
          setSessions(EMPTY_SESSIONS)
          setCompletion(EMPTY_COMPLETION)
          setStudents(EMPTY_STUDENTS)
          toast.error('Could not load progress overview from WizKlub')
        }
      } finally {
        if (!cancelled) {
          setSessionsLoading(false)
          setCompletionLoading(false)
          setStudentsLoading(false)
        }
      }
    }

    loadProgressOverview()
    return () => {
      cancelled = true
    }
  }, [batchesReady, batchId, selectedBatch, refreshKey])

  useEffect(() => {
    let cancelled = false

    async function loadLmsTime() {
      setLmsLoading(true)
      try {
        const summary = await api.getLmsTime()
        if (cancelled) return
        if (!summary) {
          setLmsDisplay('0m')
          setMonthPoints([])
          setLmsLabel(`Active in ${new Date().getFullYear()}`)
          return
        }
        setLmsDisplay(summary.display || formatLmsMinutes(summary.minutes) || '0m')
        setLmsLabel(summary.label || `Active in ${summary.year || new Date().getFullYear()}`)
        setLmsChartHint(summary.chart_hint || 'Each point is a week in the current month')
        setMonthPoints(Array.isArray(summary.month_points) ? summary.month_points : [])
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load LMS time', err)
          setLmsDisplay('0m')
          setMonthPoints([])
          toast.error('Could not load LMS time tracking')
        }
      } finally {
        if (!cancelled) setLmsLoading(false)
      }
    }

    loadLmsTime()
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  useEffect(() => {
    let cancelled = false

    async function loadFeedbackSummary() {
      if (!batchesReady || !batchId || !selectedBatch?.schoolId) {
        if (batchesReady) {
          setRating(EMPTY_RATING)
          setRatingLoading(false)
        }
        return
      }
      setRatingLoading(true)
      try {
        const summary = await api.getFeedbackSummary(batchId)
        if (cancelled) return
        if (!summary || summary.forbidden) {
          setRating(EMPTY_RATING)
          return
        }
        setRating({
          overall: Number(summary.overall) || 0,
          forms: Number(summary.forms) || 0,
          grades: Array.isArray(summary.grades) ? summary.grades : [],
        })
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load feedback summary', err)
          setRating(EMPTY_RATING)
          toast.error('Could not load feedback ratings from WizKlub')
        }
      } finally {
        if (!cancelled) setRatingLoading(false)
      }
    }

    loadFeedbackSummary()
    return () => {
      cancelled = true
    }
  }, [batchesReady, batchId, selectedBatch, refreshKey])

  useEffect(() => {
    let cancelled = false

    async function loadUploadStats() {
      if (!batchesReady || !batchId || !selectedBatch?.schoolId) {
        if (batchesReady) {
          setNorthStar(EMPTY_NORTH_STAR)
          setNorthStarLoading(false)
        }
        return
      }
      setNorthStarLoading(true)
      try {
        const schoolId = selectedBatch.schoolId
        const stats = await api.getUploadStats(batchId, schoolId)
        if (cancelled) return
        if (!stats || stats.forbidden) {
          setNorthStar(EMPTY_NORTH_STAR)
          return
        }
        setNorthStar({
          count: Number(stats.total_uploads) || 0,
          avatars: Array.isArray(stats.recent)
            ? stats.recent.map((r) => r.initials).filter(Boolean)
            : [],
          extra: Number(stats.extra) || 0,
        })
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load upload stats', err)
          setNorthStar(EMPTY_NORTH_STAR)
          toast.error('Could not load upload count')
        }
      } finally {
        if (!cancelled) setNorthStarLoading(false)
      }
    }

    loadUploadStats()
    return () => {
      cancelled = true
    }
  }, [batchesReady, batchId, selectedBatch, refreshKey])

  useEffect(() => {
    let cancelled = false

    async function loadTechIssues() {
      setTechIssuesLoading(true)
      try {
        // Teacher-wide Support counts (same source as Support page).
        const summary = await api.getTechIssueSummary()
        if (cancelled) return
        if (!summary) {
          setTechIssues(EMPTY_TECH_ISSUES)
          return
        }
        setTechIssues({
          total: Number(summary.total) || 0,
          open: Number(summary.open) || 0,
          inProgress: Number(summary.in_progress) || 0,
          closed: Number(summary.closed) || 0,
        })
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load tech issue summary', err)
          setTechIssues(EMPTY_TECH_ISSUES)
          toast.error('Could not load Support issue counts')
        }
      } finally {
        if (!cancelled) setTechIssuesLoading(false)
      }
    }

    loadTechIssues()
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  const handleRefresh = () => {
    setRefreshKey((k) => k + 1)
    toast.success('Analytics refreshed')
  }

  const handleExport = () => {
    toast.info('PDF export will be available soon')
  }

  return (
    <AppShell activeTab="analytics" className="page-analytics">
      <div className="page analytics-page animate-in">
        <PageHeader
          title="Analytics"
          subtitle="Batch performance, delivery, and improvement signals."
        />

        <div className="analytics-toolbar">
          <label className="analytics-toolbar__field" htmlFor="analytics-batch">
            <span>Select Batch</span>
            <select
              id="analytics-batch"
              className="analytics-toolbar__select"
              value={batchId}
              onChange={(e) => setBatchId(e.target.value)}
            >
              {batches.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {batch.label}
                </option>
              ))}
            </select>
          </label>

          <div className="analytics-toolbar__actions">
            <button type="button" className="analytics-btn analytics-btn--outline" onClick={handleExport}>
              <IconDownload size={16} /> Export PDF
            </button>
            <button type="button" className="analytics-btn analytics-btn--primary" onClick={handleRefresh}>
              <IconRefresh size={16} /> Refresh Data
            </button>
          </div>
        </div>

        <div className="analytics-stack">
          {/* Monthly Session Summary — live from WizKlub batch_info */}
          <section className="analytics-card card">
            <div className="analytics-card__head">
              <h2>Monthly Session Summary</h2>
              <button type="button" className="analytics-icon-btn" aria-label="More options">
                <IconMore size={14} />
              </button>
            </div>
            {sessionsLoading ? (
              <p className="analytics-lms__label" style={{ margin: '1rem 0' }}>Loading session data…</p>
            ) : (
              <>
                <DonutChart
                  total={data.sessions.total}
                  done={data.sessions.done}
                  missed={data.sessions.missed}
                  cancelled={data.sessions.cancelled}
                />
                <div className="analytics-legend">
                  <span><i className="dot dot--done" /> {data.sessions.done} Done</span>
                  <span><i className="dot dot--missed" /> {data.sessions.missed} Missed</span>
                  <span><i className="dot dot--cancelled" /> {data.sessions.cancelled} Cancelled</span>
                </div>
              </>
            )}
          </section>

          {/* Tech Issues Raised — from Support (Testimonials feedbacks) */}
          <section className="analytics-card card">
            <div className="analytics-card__head">
              <h2>Tech Issues Raised</h2>
              <button
                type="button"
                className="analytics-link"
                onClick={() => navigate('/feedback')}
              >
                View All
              </button>
            </div>
            <div className={`analytics-issue-grid${techIssuesLoading ? ' is-loading' : ''}`}>
              <div className="analytics-issue analytics-issue--total">
                <strong>{data.techIssues.total}</strong>
                <span>Total Raised</span>
              </div>
              <div className="analytics-issue analytics-issue--open">
                <strong>{data.techIssues.open}</strong>
                <span>Open</span>
              </div>
              <div className="analytics-issue analytics-issue--progress">
                <strong>{data.techIssues.inProgress}</strong>
                <span>In Progress</span>
              </div>
              <div className="analytics-issue analytics-issue--closed">
                <strong>{data.techIssues.closed}</strong>
                <span>Closed</span>
              </div>
            </div>
          </section>

          {/* Completion Tracker */}
          <section className="analytics-card card">
            <div className="analytics-card__head analytics-card__head--wrap">
              <div>
                <h2>Completion Tracker</h2>
                <p className="analytics-card__sub">Instructor Delivery vs Student Completion</p>
              </div>
              <div className="analytics-mini-legend">
                <span><i className="dot dot--delivery" /> Delivery</span>
                <span><i className="dot dot--completion" /> Completion</span>
              </div>
            </div>
            <div className="analytics-completion-list">
              {completionLoading ? (
                <p className="analytics-lms__label">Loading completion…</p>
              ) : (
                data.completion.map((row) => (
                  <div key={row.label} className="analytics-completion-row">
                    <div className="analytics-completion-row__meta">
                      <span>{row.label}</span>
                      <strong>{row.delivery}% | {row.completion}%</strong>
                    </div>
                    <DualProgress delivery={row.delivery} completion={row.completion} />
                  </div>
                ))
              )}
            </div>
          </section>
          {/* North Star Videos — live total upload file count for selected batch */}
          <section className="analytics-card card">
            <h2 className="analytics-card__title">North Star Videos</h2>
            {northStarLoading ? (
              <p className="analytics-lms__label" style={{ margin: '1rem 0' }}>Loading uploads…</p>
            ) : (
              <>
                <div className="analytics-northstar">
                  <div className="analytics-northstar__icon" aria-hidden="true">
                    <IconVideo size={22} />
                  </div>
                  <div>
                    <p className="analytics-northstar__count">{data.northStar.count}</p>
                    <p className="analytics-northstar__label">Total Uploads</p>
                  </div>
                </div>
                {data.northStar.avatars.length > 0 && (
                  <div className="analytics-activity">
                    <p className="analytics-activity__label">Recent Activity</p>
                    <div className="analytics-avatars">
                      {data.northStar.avatars.map((initials, idx) => (
                        <span key={`${initials}-${idx}`} className="analytics-avatar">{initials}</span>
                      ))}
                      {data.northStar.extra > 0 && (
                        <span className="analytics-avatar analytics-avatar--more">+{data.northStar.extra}</span>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>

          {/* Students Needing Improvement */}
          <section className="analytics-card card">
            <h2 className="analytics-card__title">Students Needing Improvement</h2>
            {studentsLoading ? (
              <p className="analytics-lms__label" style={{ margin: '1rem 0' }}>Loading students…</p>
            ) : data.students.length === 0 ? (
              <p className="analytics-lms__label" style={{ margin: '1rem 0' }}>No students to show</p>
            ) : (
              <div className="analytics-table" role="table">
                <div className="analytics-table__head" role="row">
                  <span role="columnheader">Rank</span>
                  <span role="columnheader">Student</span>
                  <span role="columnheader">Score</span>
                  <span role="columnheader">Status</span>
                </div>
                {data.students.map((student) => (
                  <div key={`${student.rank}-${student.name}`} className="analytics-table__row" role="row">
                    <span className="analytics-rank" role="cell">{student.rank}</span>
                    <span className="analytics-student" role="cell">{student.name}</span>
                    <div className="analytics-score" role="cell">
                      <span>{student.score}%</span>
                      <div className="analytics-score__track">
                        <div
                          className={`analytics-score__fill ${student.critical ? 'analytics-score__fill--critical' : 'analytics-score__fill--warn'}`}
                          style={{ width: `${Math.min(student.score, 100)}%` }}
                        />
                      </div>
                    </div>
                    <span
                      className={`analytics-status ${student.critical ? 'analytics-status--critical' : 'analytics-status--warn'}`}
                      role="cell"
                      aria-label={student.critical ? 'Critical' : 'Needs attention'}
                    >
                      <IconWarning size={15} />
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Average Rating — from wizklub.feedback (Admin batch Overall Average Rating) */}
          <section className="analytics-card card">
            <h2 className="analytics-card__title">Average Rating</h2>
            {ratingLoading ? (
              <p className="analytics-lms__label" style={{ margin: '1rem 0' }}>Loading ratings…</p>
            ) : (
              <>
                <div className="analytics-rating">
                  <p className="analytics-rating__value">{data.rating.overall.toFixed(1)}</p>
                  <div className="analytics-rating__stars" aria-hidden="true">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <IconStar key={`star-${i}`} size={18} filled={i < Math.round(data.rating.overall)} />
                    ))}
                  </div>
                  <p className="analytics-rating__note">
                    {data.rating.forms > 0
                      ? `Based on ${data.rating.forms} feedback forms`
                      : 'No feedback data available'}
                  </p>
                                                  </div>
                {data.rating.grades?.length > 0 && (
                  <div className="analytics-grade-breakdown">
                    <p className="analytics-grade-breakdown__title">Grade Breakdown</p>
                    {data.rating.grades.map((item) => (
                      <div key={item.grade} className="analytics-grade-row">
                        <div className="analytics-grade-row__meta">
                          <span>{item.grade}</span>
                          <strong>
                            {Number(item.value).toFixed(1)}
                            {item.tag ? ` (${item.tag})` : ''}
                          </strong>
                        </div>
                        <div className="analytics-grade-row__track">
                          <div
                            className={`analytics-grade-row__fill analytics-grade-row__fill--${item.tone || 'mid'}`}
                            style={{ width: `${(Number(item.value) / 5) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>

          {/* LMS Time Spent — from wizklub_lms tracking */}
          <section className="analytics-card card">
            <h2 className="analytics-card__title">LMS Time Spent</h2>
            <div className="analytics-lms">
              {lmsLoading ? (
                <p className="analytics-lms__label">Loading LMS time…</p>
              ) : (
                <>
                  <p className="analytics-lms__value">{data.lmsDisplay}</p>
                  <p className="analytics-lms__label">{lmsLabel}</p>
                  <p className="analytics-lms__hint">{lmsChartHint}</p>
                  <LmsMonthChart points={data.monthPoints} />
                </>
              )}
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  )
}
