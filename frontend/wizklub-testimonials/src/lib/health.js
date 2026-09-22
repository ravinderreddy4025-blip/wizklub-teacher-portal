/** Student-health helpers shared by the batch health page, student report and dashboard card. */

export const BANDS = ['G', 'A', 'R', 'N']

export const BAND_META = {
  G: { label: 'Green', short: 'On track' },
  A: { label: 'Amber', short: 'Watch' },
  R: { label: 'Red', short: 'Needs help' },
  N: { label: 'Not measured', short: 'Not measured' },
}

/** Severity order for sorting: Red first, Not measured last. */
export const BAND_RANK = { R: 0, A: 1, G: 2, N: 3 }

export function bandOf(value) {
  return BANDS.includes(value) ? value : 'N'
}

/** Snapshot percentages can carry decimals (88.9) — show whole numbers. */
export function num(value) {
  return value == null || Number.isNaN(Number(value)) ? null : Math.round(Number(value))
}

/** "GRADE_9" / "9" → "Grade 9". */
export function gradeLabel(grade) {
  if (grade == null || grade === '') return ''
  const m = String(grade).match(/(\d+)/)
  return m ? `Grade ${m[1]}` : String(grade).replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())
}

/** Friendly first name; skips leading initials ("V Lingeshvaran" → "Lingeshvaran"). */
export function firstName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  return parts.find((p) => p.replace(/\./g, '').length > 1) || parts[0] || 'the student'
}

export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return `${parts[0][0] ?? ''}${parts.length > 1 ? parts[parts.length - 1][0] ?? '' : ''}`.toUpperCase()
}

export function formatDate(value, { withYear = false } = {}) {
  if (!value) return ''
  const d = new Date(String(value).length === 10 ? `${value}T00:00:00` : value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) })
}

/** "3 days ago" style, relative to the snapshot date (not the browser clock). */
export function formatRelative(value, asOf) {
  if (!value) return ''
  const d = new Date(value)
  const ref = asOf ? new Date(`${String(asOf).slice(0, 10)}T23:59:59`) : new Date()
  if (Number.isNaN(d.getTime())) return ''
  const days = Math.max(0, Math.floor((ref - d) / 86400000))
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days} days ago`
  return formatDate(value)
}

/** Participation cell text — never shows 0% for not-started / not-measured. */
export function participationText(p) {
  if (!p) return 'Not measured'
  if (p.not_started) return 'Not started'
  if (p.band === 'N' || !p.due) return 'Not measured'
  return `${p.done}/${p.due} workouts`
}

export function outcomesText(o) {
  if (!o || o.band === 'N' || o.score == null) return 'Not measured'
  return `Score ${num(o.score)}`
}

export function attendanceText(a) {
  if (!a || a.band === 'N' || a.pct == null) return 'Not measured'
  return `${num(a.pct)}%`
}

/** Assessment session ids the batch has taken (union across the roster). */
export function heldAssessmentIds(students = []) {
  const ids = new Set()
  for (const s of students) for (const a of s?.outcomes?.assessments ?? []) if (a?.session_id) ids.add(String(a.session_id))
  return ids
}

/** Pending = missed an assessment batch-mates have taken. Prefer the snapshot's own count when present. */
export function pendingAssessmentCount(student, heldIds) {
  const given = student?.outcomes?.pending_assessments
  if (typeof given === 'number') return given
  if (!heldIds?.size) return 0
  const taken = new Set((student?.outcomes?.assessments ?? []).map((a) => String(a.session_id)))
  let n = 0
  for (const id of heldIds) if (!taken.has(id)) n += 1
  return n
}

export function isPendingAssessment(student, heldIds) {
  if (typeof student?.outcomes?.pending_assessments === 'number') return student.outcomes.pending_assessments > 0
  if (!heldIds?.size) return false
  const taken = new Set((student?.outcomes?.assessments ?? []).map((a) => String(a.session_id)))
  for (const id of heldIds) if (!taken.has(id)) return true
  return false
}

/* Roster filters: "<pillar>:<band>" | "participation:not_started" | "pending_assessment" | "all". */
export const FILTERS = {
  all: { label: 'All students', test: () => true },
  'overall:R': { label: 'Overall Red', test: (s) => s.overall_band === 'R' },
  'overall:A': { label: 'Overall Amber', test: (s) => s.overall_band === 'A' },
  'overall:G': { label: 'Overall Green', test: (s) => s.overall_band === 'G' },
  'overall:N': { label: 'Overall not measured', test: (s) => bandOf(s.overall_band) === 'N' },
  'participation:not_started': { label: 'Not started workouts', test: (s) => Boolean(s.participation?.not_started) },
  pending_assessment: { label: 'Pending assessment', test: (s, ctx) => isPendingAssessment(s, ctx.heldIds) },
  'login:never': { label: 'Never logged in', test: (s) => s.login && !s.login.ever_logged_in },
}
for (const pillar of ['participation', 'outcomes']) {
  const name = pillar === 'participation' ? 'Participation' : 'Outcomes'
  for (const b of BANDS) {
    FILTERS[`${pillar}:${b}`] = {
      label: `${name}: ${BAND_META[b].label}`,
      test: (s) => bandOf(s[pillar]?.band) === b,
    }
  }
}

export const SORTS = {
  name: (s) => String(s.name || '').toLowerCase(),
  overall: (s) => BAND_RANK[bandOf(s.overall_band)],
  participation: (s) => (s.participation?.not_started ? -1 : s.participation?.band === 'N' ? 999 : s.participation?.pct ?? 999),
  outcomes: (s) => (s.outcomes?.band === 'N' || s.outcomes?.score == null ? 999 : s.outcomes.score),
  attendance: (s) => (s.attendance?.band === 'N' || s.attendance?.pct == null ? 999 : s.attendance.pct),
  last_active: (s) => (s.last_active_at ? -new Date(s.last_active_at).getTime() : Number.MAX_SAFE_INTEGER),
}

export function sortStudents(rows, key, dir) {
  const get = SORTS[key] ?? SORTS.overall
  const mult = dir === 'desc' ? -1 : 1
  return [...rows].sort((a, b) => {
    const va = get(a)
    const vb = get(b)
    if (va < vb) return -1 * mult
    if (va > vb) return 1 * mult
    return String(a.name).localeCompare(String(b.name))
  })
}

/**
 * One concrete action for the teacher, derived from the bands (priority order).
 * Returns up to `limit` suggestions, most urgent first.
 */
export function suggestedSteps(student, { pendingAssessments = 0, limit = 2 } = {}) {
  if (!student) return []
  const name = firstName(student.name)
  const p = student.participation ?? {}
  const o = student.outcomes ?? {}
  const a = student.attendance ?? {}
  const steps = []
  if (p.not_started) {
    steps.push(
      student.login && !student.login.ever_logged_in
        ? `Sit with ${name} at the lab system next class — help them log in for the first time and finish one workout together.`
        : `Sit with ${name} at the lab system next class and finish the first workout together.`,
    )
  }
  if (a.band === 'R') {
    steps.push(`${name} attended ${a.present} of ${a.held} classes — check in with the class teacher or parents about attendance.`)
  }
  if (pendingAssessments > 0) {
    steps.push(
      `${name} has ${pendingAssessments} assessment${pendingAssessments === 1 ? '' : 's'} pending that batch-mates have taken — plan a make-up attempt this week.`,
    )
  }
  if (!p.not_started && p.band === 'R') {
    const left = Math.max((p.due ?? 0) - (p.done ?? 0), 0)
    steps.push(`${name} has ${left} workouts pending — pair them with a partner at the lab system and check submissions before class ends.`)
  }
  if (o.band === 'R') {
    steps.push(
      o.code_run_pct != null && o.code_run_pct < 40
        ? `Only ${o.code_runs_ok} of ${o.code_runs_total} coding exercises ran successfully — debug one program with ${name} step by step.`
        : `Go over the last assessment with ${name} and revisit the topics they missed.`,
    )
  }
  if (!steps.length && p.band === 'A') {
    steps.push(`${name} is close — set a small target of finishing every workout in the next two sessions.`)
  }
  if (!steps.length && o.band === 'A') {
    steps.push(`Encourage ${name} to re-run failing programs until they work — outcomes are just below Green.`)
  }
  if (!steps.length && bandOf(student.overall_band) === 'N') {
    steps.push(`Not enough data on ${name} yet — check again after a few more sessions.`)
  }
  if (!steps.length) steps.push(`${name} is on track — recognise their effort in class.`)
  return steps.slice(0, limit)
}

function csvCell(value) {
  const str = value == null ? '' : String(value)
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

export function rosterCsv(rows, { heldIds } = {}) {
  const header = [
    'Student', 'Username', 'Overall band', 'Participation band', 'Workouts done', 'Workouts due', 'Participation %',
    'Not started', 'Outcomes band', 'Outcomes score', 'Assessment avg %', 'Assessments taken', 'Code runs ok',
    'Code runs total', 'Pending assessments', 'Attendance %', 'Classes present', 'Classes held', 'Ever logged in',
    'Last active', 'Reasons',
  ]
  const lines = rows.map((s) => [
    s.name, s.username, BAND_META[bandOf(s.overall_band)].label,
    BAND_META[bandOf(s.participation?.band)].label, s.participation?.done, s.participation?.due,
    s.participation?.not_started || s.participation?.band === 'N' ? '' : s.participation?.pct,
    s.participation?.not_started ? 'Yes' : 'No',
    BAND_META[bandOf(s.outcomes?.band)].label, s.outcomes?.score, s.outcomes?.avg_assessment_pct,
    s.outcomes?.assessments_taken, s.outcomes?.code_runs_ok, s.outcomes?.code_runs_total,
    pendingAssessmentCount(s, heldIds),
    s.attendance?.band === 'N' ? '' : s.attendance?.pct, s.attendance?.present, s.attendance?.held,
    s.login?.ever_logged_in ? 'Yes' : 'No', s.last_active_at ? String(s.last_active_at).slice(0, 10) : '',
    (s.reasons ?? []).join('; '),
  ].map(csvCell).join(','))
  return [header.join(','), ...lines].join('\n')
}

export function downloadText(filename, text, type = 'text/csv;charset=utf-8') {
  const blob = new Blob(['﻿', text], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Path helpers — keep the optional /schools/:schoolId prefix so breadcrumbs and back links stay in context. */
export function batchHealthPath(batchId, schoolId, filter) {
  const base = schoolId ? `/schools/${schoolId}/batches/${batchId}/health` : `/batches/${batchId}/health`
  return filter && filter !== 'all' ? `${base}?filter=${encodeURIComponent(filter)}` : base
}

export function studentHealthPath(batchId, username, schoolId) {
  const base = schoolId ? `/schools/${schoolId}/batches/${batchId}` : `/batches/${batchId}`
  return `${base}/health/students/${encodeURIComponent(username)}`
}

export function batchStudentsPath(batchId, schoolId) {
  return schoolId ? `/schools/${schoolId}/batches/${batchId}/students` : `/batches/${batchId}/students`
}

export const PRODIGY_STRANDS = {
  A: 'AI literacy',
  C: 'Computational thinking',
  I: 'Innovation',
  L: 'Logical reasoning',
  M: 'Math application',
  S: 'Spatial reasoning',
}
