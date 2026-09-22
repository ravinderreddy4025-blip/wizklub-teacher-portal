import { CheckCircle2, Clock3, ScanLine, TriangleAlert } from 'lucide-react'

/*
 * Assessment conduct header (WizKlub design system):
 *   breadcrumb › page title + status tag, then a progress strip with the three numbers a teacher
 *   watches during the test — responses captured on this question, still waiting, SR cards missing.
 */

const STATUS_TONE = {
  COMPLETED: 'success',
  IN_PROGRESS: 'info',
  NOT_STARTED: 'neutral',
  SCHEDULED: 'neutral',
}

function formatStatus(status) {
  const normalized = String(status || '').trim().toUpperCase()
  if (!normalized) return 'Not started'
  return normalized
    .split('_')
    .map((part, i) => (i === 0 ? part.charAt(0) + part.slice(1).toLowerCase() : part.toLowerCase()))
    .join(' ')
}

export default function AssessmentHeader({
  title,
  batchName,
  questionIndex,
  totalQuestions,
  duration,
  status,
  capturedCount = 0,
  studentCount = 0,
  missingSrCardCount = 0,
}) {
  const tone = STATUS_TONE[String(status || '').toUpperCase()] || 'neutral'
  const hasQuestions = totalQuestions > 0
  const pct = hasQuestions ? Math.round(((questionIndex + 1) / totalQuestions) * 100) : 0
  const waiting = Math.max(0, studentCount - capturedCount - missingSrCardCount)

  return (
    <header className="ac-head">
      <nav className="ac-head__crumbs" aria-label="Breadcrumb">
        <span>Assessments</span>
        <span aria-hidden="true">›</span>
        <span>{batchName}</span>
      </nav>
      <div className="ac-head__row">
        <div className="ac-head__titles">
          <h1 className="ac-head__title">{title || 'Assessment'}</h1>
          <p className="ac-head__sub">
            {batchName}
            {duration ? ` · ${duration} min` : ''}
            {hasQuestions ? ` · ${totalQuestions} questions` : ''}
          </p>
        </div>
        <span className={`ac-tag ac-tag--${tone}`}>{formatStatus(status)}</span>
      </div>

      <div className="ac-progress" aria-label="Assessment progress">
        <div className="ac-progress__top">
          <span className="ac-progress__label">
            {hasQuestions ? `Question ${questionIndex + 1} of ${totalQuestions}` : 'No questions'}
          </span>
          <span className="ac-progress__pct">{pct}%</span>
        </div>
        <div
          className="ac-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label="Questions completed"
        >
          <span className="ac-bar__fill" style={{ width: `${pct}%` }} />
        </div>
        <ul className="ac-kpis" aria-label="Responses on this question">
          <li className="ac-kpi ac-kpi--green">
            <span className="ac-kpi__icon"><CheckCircle2 size={18} strokeWidth={2.4} aria-hidden="true" /></span>
            <span className="ac-kpi__num">{capturedCount}</span>
            <span className="ac-kpi__lbl">captured</span>
          </li>
          <li className="ac-kpi">
            <span className="ac-kpi__icon"><Clock3 size={18} strokeWidth={2.4} aria-hidden="true" /></span>
            <span className="ac-kpi__num">{waiting}</span>
            <span className="ac-kpi__lbl">waiting</span>
          </li>
          <li className={`ac-kpi${missingSrCardCount ? ' ac-kpi--amber' : ''}`}>
            <span className="ac-kpi__icon">{missingSrCardCount ? <TriangleAlert size={18} strokeWidth={2.4} aria-hidden="true" /> : <ScanLine size={18} strokeWidth={2.4} aria-hidden="true" />}</span>
            <span className="ac-kpi__num">{missingSrCardCount}</span>
            <span className="ac-kpi__lbl">SR card missing</span>
          </li>
        </ul>
      </div>
    </header>
  )
}
