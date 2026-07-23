import { useMemo, useState } from 'react'
import { toast } from 'react-toastify'
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

const BATCHES = [
  { id: 'g8a', label: 'Grade 8-A' },
  { id: 'g8b', label: 'Grade 8-B' },
  { id: 'g7a', label: 'Grade 7-A' },
  { id: 'g9a', label: 'Grade 9-A' },
]

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
  const doneLen = (done / total) * c
  const missedLen = (missed / total) * c
  const cancelledLen = (cancelled / total) * c

  return (
    <div className="analytics-donut" aria-hidden="true">
      <svg viewBox="0 0 140 140" className="analytics-donut__svg">
        <circle cx="70" cy="70" r={r} className="analytics-donut__track" />
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
  const [batchId, setBatchId] = useState('g8a')
  const [refreshKey, setRefreshKey] = useState(0)

  const data = useMemo(() => ANALYTICS_BY_BATCH[batchId] || ANALYTICS_BY_BATCH.g8a, [batchId, refreshKey])
  const maxBar = Math.max(...data.weeklyBars)

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
              {BATCHES.map((batch) => (
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
          {/* Monthly Session Summary */}
          <section className="analytics-card card">
            <div className="analytics-card__head">
              <h2>Monthly Session Summary</h2>
              <button type="button" className="analytics-icon-btn" aria-label="More options">
                <IconMore size={14} />
              </button>
            </div>
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
          </section>

          {/* LMS Time Spent */}
          <section className="analytics-card card">
            <h2 className="analytics-card__title">LMS Time Spent</h2>
            <div className="analytics-lms">
              <p className="analytics-lms__value">{data.lmsHours} hrs</p>
              <p className="analytics-lms__label">Avg. per teacher</p>
            </div>
            <div className="analytics-bars" aria-hidden="true">
              {data.weeklyBars.map((value, index) => (
                <div
                  key={`week-bar-${index}`}
                  className={`analytics-bars__item ${index === data.weeklyBars.length - 1 ? 'analytics-bars__item--peak' : ''}`}
                  style={{ height: `${Math.round((value / maxBar) * 100)}%` }}
                />
              ))}
            </div>
            <div className="analytics-bars__labels">
              <span>Week 1</span>
              <span>Week 4</span>
            </div>
          </section>

          {/* Tech Issues Raised */}
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
            <div className="analytics-issue-grid">
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
              {data.completion.map((row) => (
                <div key={row.label} className="analytics-completion-row">
                  <div className="analytics-completion-row__meta">
                    <span>{row.label}</span>
                    <strong>{row.delivery}% | {row.completion}%</strong>
                  </div>
                  <DualProgress delivery={row.delivery} completion={row.completion} />
                </div>
              ))}
            </div>
          </section>

          {/* North Star Videos */}
          <section className="analytics-card card">
            <h2 className="analytics-card__title">North Star Videos</h2>
            <div className="analytics-northstar">
              <div className="analytics-northstar__icon" aria-hidden="true">
                <IconVideo size={22} />
              </div>
              <div>
                <p className="analytics-northstar__count">{data.northStar.count}</p>
                <p className="analytics-northstar__label">Uploaded Content</p>
              </div>
            </div>
            <div className="analytics-activity">
              <p className="analytics-activity__label">Recent Activity</p>
              <div className="analytics-avatars">
                {data.northStar.avatars.map((initials) => (
                  <span key={initials} className="analytics-avatar">{initials}</span>
                ))}
                <span className="analytics-avatar analytics-avatar--more">+{data.northStar.extra}</span>
              </div>
            </div>
          </section>

          {/* Students Needing Improvement */}
          <section className="analytics-card card">
            <h2 className="analytics-card__title">Students Needing Improvement</h2>
            <div className="analytics-table" role="table">
              <div className="analytics-table__head" role="row">
                <span role="columnheader">Rank</span>
                <span role="columnheader">Student</span>
                <span role="columnheader">Score</span>
                <span role="columnheader">Status</span>
              </div>
              {data.students.map((student) => (
                <div key={student.name} className="analytics-table__row" role="row">
                  <span className="analytics-rank" role="cell">{student.rank}</span>
                  <span className="analytics-student" role="cell">{student.name}</span>
                  <div className="analytics-score" role="cell">
                    <span>{student.score}%</span>
                    <div className="analytics-score__track">
                      <div
                        className={`analytics-score__fill ${student.critical ? 'analytics-score__fill--critical' : 'analytics-score__fill--warn'}`}
                        style={{ width: `${student.score}%` }}
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
          </section>

          {/* Average Rating */}
          <section className="analytics-card card">
            <h2 className="analytics-card__title">Average Rating</h2>
            <div className="analytics-rating">
              <p className="analytics-rating__value">{data.rating.overall.toFixed(1)}</p>
              <div className="analytics-rating__stars" aria-hidden="true">
                {Array.from({ length: 5 }).map((_, i) => (
                  <IconStar key={`star-${i}`} size={18} filled={i < Math.round(data.rating.overall)} />
                ))}
              </div>
              <p className="analytics-rating__note">Based on {data.rating.forms} feedback forms</p>
            </div>
            <div className="analytics-grade-breakdown">
              <p className="analytics-grade-breakdown__title">Grade Breakdown</p>
              {data.rating.grades.map((item) => (
                <div key={item.grade} className="analytics-grade-row">
                  <div className="analytics-grade-row__meta">
                    <span>{item.grade}</span>
                    <strong>
                      {item.value.toFixed(1)}
                      {item.tag ? ` (${item.tag})` : ''}
                    </strong>
                  </div>
                  <div className="analytics-grade-row__track">
                    <div
                      className={`analytics-grade-row__fill analytics-grade-row__fill--${item.tone}`}
                      style={{ width: `${(item.value / 5) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  )
}
