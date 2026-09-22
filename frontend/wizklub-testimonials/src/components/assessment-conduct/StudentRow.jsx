import { memo } from 'react'
import { bumpRenderCount } from '../../utils/conductPerf'

/* One student in the conduct list: soft avatar · name + username · SR tag · answer / submit status. */

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

function responseAnswer(response) {
  const selected = response?.selected_answer
  return selected == null || selected === '' ? null : String(selected)
}

function submitStatus(student) {
  const status = student.submit_status
  if (!status || status === 'IN_PROGRESS') return null
  if (status === 'COMPLETED') {
    const score = student.submit_score_total != null ? ` · ${student.submit_score_total} pts` : ''
    return { tone: 'success', label: `Submitted${score}` }
  }
  if (status === 'SKIPPED_ALREADY_COMPLETED') return { tone: 'neutral', label: 'Already submitted' }
  if (status === 'FAILED') {
    const reason = student.submit_failure_stage ? String(student.submit_failure_stage).replace(/_/g, ' ') : 'failed'
    return { tone: 'danger', label: `Failed — ${reason}` }
  }
  return { tone: 'neutral', label: status }
}

function studentRowPropsAreEqual(prev, next) {
  const a = prev.student
  const b = next.student
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.student_id === b.student_id &&
    a.username === b.username &&
    a.name === b.name &&
    a.has_sr_card === b.has_sr_card &&
    a.captured === b.captured &&
    a.response?.selected_answer === b.response?.selected_answer &&
    a.response?.verified === b.response?.verified &&
    a.submit_status === b.submit_status &&
    a.submit_failure_stage === b.submit_failure_stage &&
    a.submit_score_total === b.submit_score_total
  )
}

function StudentRow({ student }) {
  bumpRenderCount('StudentRow')
  const name = student.name || student.username || student.student_id
  const username = student.username || student.student_id
  const srAvailable = Boolean(student.has_sr_card)
  const captured = Boolean(student.captured)
  const answer = responseAnswer(student.response)
  const submitted = submitStatus(student)

  return (
    <li className={`ac-row${captured ? ' ac-row--captured' : ''}`}>
      <span className="ac-avatar" aria-hidden="true">
        {initials(name)}
      </span>
      <div className="ac-row__info">
        <p className="ac-row__name">{name}</p>
        <p className="ac-row__meta">{username}</p>
      </div>
      <div className="ac-row__right">
        {!srAvailable ? <span className="ac-tag ac-tag--warning">SR missing</span> : null}
        {submitted ? (
          <span className={`ac-tag ac-tag--${submitted.tone}`}>{submitted.label}</span>
        ) : answer ? (
          <span className="ac-answer" aria-label={`Answer ${answer}`}>
            {answer}
          </span>
        ) : srAvailable ? (
          <span className="ac-row__waiting">Waiting…</span>
        ) : null}
      </div>
    </li>
  )
}

export default memo(StudentRow, studentRowPropsAreEqual)
