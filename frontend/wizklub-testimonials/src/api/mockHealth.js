/**
 * Demo health snapshot (HEALTH_CONTRACT v1 shapes) for VITE_USE_MOCK and local fixtures.
 * Deterministic: the same roster always produces the same numbers. Dependency-free so a
 * Node script can reuse it to seed a dev Mongo database.
 */

export const HEALTH_THRESHOLDS = {
  delivery: { green: 90, amber: 70 },
  participation: { green: 60, amber: 40, min_lab_sessions: 2 },
  outcomes: { green: 60, amber: 40, assessment_weight: 0.5 },
  attendance: { green: 80, amber: 60, min_held: 3 },
  rollup: { green: 60, amber: 40 },
}

const WORKOUTS_PER_LAB = 3
const ASSESSMENTS = ['Assessment 1', 'Assessment 2', 'Assessment 3']
const LAB_TOPICS = [
  'Sequencing with Scratch', 'Loops & repeat blocks', 'Events and sprites', 'Conditionals',
  'Variables & score', 'Smart light circuit', 'Seven-segment display', 'Sensors in the lab',
  'Debugging challenge', 'Mini game build', 'Pattern puzzles', 'Robot path planning',
]
const LECTURE_TOPICS = [
  'What is an algorithm?', 'Thinking like a computer', 'Everyday automation', 'Data around us',
  'How the internet works', 'AI in daily life', 'Design thinking', 'Logic gates story',
]

function hash(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function rng(seed) {
  let a = hash(String(seed))
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pct = (num, den) => (den > 0 ? Math.round((num / den) * 100) : null)
const iso = (d) => d.toISOString().slice(0, 10)
const addDays = (d, n) => new Date(d.getTime() + n * 86400000)

function band(value, { green, amber }) {
  if (value == null) return 'N'
  if (value >= green) return 'G'
  if (value >= amber) return 'A'
  return 'R'
}

function worst(bands) {
  const real = bands.filter((b) => b && b !== 'N')
  if (!real.length) return 'N'
  if (real.includes('R')) return 'R'
  if (real.includes('A')) return 'A'
  return 'G'
}

function rollup(students, pillar) {
  const counts = { G: 0, A: 0, R: 0, N: 0 }
  for (const s of students) counts[s[pillar].band] += 1
  const measured = counts.G + counts.A + counts.R
  const score = measured ? Math.round(((3 * counts.G + counts.A) / (3 * measured)) * 100) : null
  return { ...counts, score, band: band(score, HEALTH_THRESHOLDS.rollup) }
}

/** Student archetypes cycle through the roster so every screen state shows up in the demo. */
const ARCHETYPES = [
  { key: 'star', attend: 0.95, effort: 0.9, skill: 0.85, login: true },
  { key: 'steady', attend: 0.85, effort: 0.6, skill: 0.62, login: true },
  { key: 'not_started', attend: 0.8, effort: 0, skill: 0.5, login: false },
  { key: 'struggling', attend: 0.75, effort: 0.25, skill: 0.3, login: true },
  { key: 'steady', attend: 0.9, effort: 0.55, skill: 0.5, login: true },
  { key: 'absentee', attend: 0.45, effort: 0.35, skill: 0.45, login: true },
  { key: 'star', attend: 0.92, effort: 0.8, skill: 0.72, login: true },
  { key: 'late_joiner', attend: 0.9, effort: 0.5, skill: null, login: true },
]

function buildClasses(batch, asOf, r) {
  const start = new Date(`${batch.start_date}T00:00:00Z`)
  const classes = []
  let lab = 0
  let lecture = 0
  let assessment = 0
  // Two classes a week (Mon + Thu), every 3rd week has an assessment on Thursday.
  for (let d = start, week = 0; d <= asOf; d = addDays(d, 7), week += 1) {
    for (const offset of [0, 3]) {
      const day = addDays(d, offset)
      if (day > asOf) break
      let kind = offset === 0 ? 'lab' : 'lecture'
      let name
      if (offset === 3 && week % 5 === 4 && assessment < ASSESSMENTS.length) {
        kind = 'assessment'
        name = ASSESSMENTS[assessment]
        assessment += 1
      } else if (kind === 'lab') {
        name = LAB_TOPICS[lab % LAB_TOPICS.length]
        lab += 1
      } else {
        name = LECTURE_TOPICS[lecture % LECTURE_TOPICS.length]
        lecture += 1
      }
      const roll = r()
      const status = kind === 'assessment' ? 'COMPLETED' : roll < batch.cancel_rate ? 'CANCELLED' : roll < batch.cancel_rate + 0.05 ? 'PARTIAL' : 'COMPLETED'
      classes.push({
        date: iso(day),
        session_id: `${batch.batch_id}-s${classes.length + 1}`,
        session_name: name,
        kind,
        status,
      })
    }
  }
  return classes
}

function studentReasons(s, first) {
  const reasons = []
  const p = s.participation
  const o = s.outcomes
  if (p.not_started) reasons.push(`Workouts not started — 0 of ${p.due} done`)
  else if (p.band === 'N') reasons.push('Not enough sessions yet to measure workouts')
  else reasons.push(`${p.done} of ${p.due} workouts done (${p.pct}%)`)
  if (o.band === 'N') reasons.push('No assessment or code-run data yet')
  else {
    const bits = []
    if (o.avg_assessment_pct != null) bits.push(`assessment avg ${o.avg_assessment_pct}%`)
    if (o.code_run_pct != null) bits.push(`code ran in ${o.code_runs_ok} of ${o.code_runs_total} runs`)
    reasons.push(`Outcomes ${o.score}: ${bits.join(', ')}`)
  }
  if (s.attendance.band === 'R') reasons.push(`Attendance ${s.attendance.pct}% (${s.attendance.present} of ${s.attendance.held})`)
  if (!s.login.ever_logged_in) reasons.push(`${first} has never logged in this year`)
  return reasons
}

function buildStudent(batch, student, index, classes, asOf) {
  const arch = ARCHETYPES[index % ARCHETYPES.length]
  const r = rng(`${batch.batch_id}:${student.username}`)
  const joinIdx = arch.key === 'late_joiner' ? Math.max(classes.length - 3, 0) : 0
  const assessmentsHeld = classes.filter((c) => c.kind === 'assessment')

  const detailClasses = classes.map((c, i) => {
    const held = c.status !== 'CANCELLED'
    const enrolled = i >= joinIdx
    // Assessment days get better turnout than regular classes.
    const present = !held || !enrolled ? null : r() < (c.kind === 'assessment' ? Math.min(0.97, arch.attend + 0.15) : arch.attend)
    const isLab = c.kind === 'lab'
    const done = isLab && present && held ? Math.min(WORKOUTS_PER_LAB, Math.round(arch.effort * WORKOUTS_PER_LAB + (r() - 0.5) * 1.6)) : 0
    return {
      ...c,
      present,
      workouts_done: isLab && held && enrolled ? Math.max(done, 0) : 0,
      workouts_total: isLab && held && enrolled ? WORKOUTS_PER_LAB : 0,
      _enrolled: enrolled,
    }
  })

  const heldForStudent = detailClasses.filter((c) => c.status !== 'CANCELLED' && c._enrolled)
  const labHeld = heldForStudent.filter((c) => c.kind === 'lab')
  const doneTotal = arch.effort === 0 ? 0 : labHeld.reduce((sum, c) => sum + c.workouts_done, 0)
  if (arch.effort === 0) detailClasses.forEach((c) => { c.workouts_done = 0 })
  const due = labHeld.length * WORKOUTS_PER_LAB
  const presentCount = heldForStudent.filter((c) => c.present).length

  const participationPct = pct(doneTotal, due)
  const notStarted = doneTotal === 0 && labHeld.length >= HEALTH_THRESHOLDS.participation.min_lab_sessions
  const participation = {
    done: doneTotal,
    due,
    pct: participationPct,
    lab_sessions_held: labHeld.length,
    not_started: notStarted,
    band: labHeld.length < HEALTH_THRESHOLDS.participation.min_lab_sessions ? 'N' : notStarted ? 'R' : band(participationPct, HEALTH_THRESHOLDS.participation),
  }

  const assessments = []
  if (arch.skill != null) {
    for (const a of assessmentsHeld) {
      const row = detailClasses.find((c) => c.session_id === a.session_id)
      if (!row?.present) continue
      const max = 20
      const score = Math.max(0, Math.min(max, Math.round((arch.skill + (r() - 0.5) * 0.3) * max)))
      assessments.push({ session_id: a.session_id, name: a.session_name, date: a.date, score, max, pct: pct(score, max) })
    }
  }
  const avgAssessment = assessments.length ? Math.round(assessments.reduce((s, a) => s + a.pct, 0) / assessments.length) : null
  const codeRunsTotal = arch.effort === 0 || arch.skill == null ? 0 : Math.round(doneTotal * 0.8)
  const codeRunsOk = Math.round(codeRunsTotal * Math.max(0, Math.min(1, (arch.skill ?? 0) + (r() - 0.5) * 0.2)))
  const codeRunPct = pct(codeRunsOk, codeRunsTotal)
  const outcomeScore = avgAssessment != null && codeRunPct != null
    ? Math.round(0.5 * avgAssessment + 0.5 * codeRunPct)
    : avgAssessment ?? codeRunPct
  const outcomes = {
    assessments,
    avg_assessment_pct: avgAssessment,
    assessments_taken: assessments.length,
    code_runs_ok: codeRunsOk,
    code_runs_total: codeRunsTotal,
    code_run_pct: codeRunPct,
    score: outcomeScore,
    band: band(outcomeScore, HEALTH_THRESHOLDS.outcomes),
  }

  const attendancePct = pct(presentCount, heldForStudent.length)
  const attendance = {
    present: presentCount,
    held: heldForStudent.length,
    pct: attendancePct,
    band: heldForStudent.length < HEALTH_THRESHOLDS.attendance.min_held ? 'N' : band(attendancePct, HEALTH_THRESHOLDS.attendance),
  }

  // Activity: class days attended plus some at-home days, last 90 days.
  const activityMap = new Map()
  const from = addDays(asOf, -89)
  for (const c of detailClasses) {
    const d = new Date(`${c.date}T00:00:00Z`)
    if (arch.login && c.present && d >= from) activityMap.set(c.date, 2 + c.workouts_done * 3 + Math.round(r() * 4))
  }
  if (arch.login && arch.effort > 0) {
    for (let d = from; d <= asOf; d = addDays(d, 1)) {
      if (r() < arch.effort * 0.18) {
        const key = iso(d)
        activityMap.set(key, (activityMap.get(key) ?? 0) + 1 + Math.round(r() * 6))
      }
    }
  }
  const activity = [...activityMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, events]) => ({ date, events }))
  const lastActive = arch.login && activity.length ? activity[activity.length - 1].date : null
  const thirtyAgo = iso(addDays(asOf, -29))
  const activeDays30 = arch.login ? activity.filter((a) => a.date >= thirtyAgo).length : 0

  const s = {
    run_id: batch.run_id,
    batch_id: batch.batch_id,
    school_id: batch.school_id,
    username: student.username,
    name: student.name,
    grade: batch.grade,
    attendance,
    participation,
    outcomes,
    login: {
      ever_logged_in: arch.login,
      last_login_at: arch.login && lastActive ? `${lastActive}T10:${String(10 + (index % 40)).padStart(2, '0')}:00.000Z` : null,
    },
    active_days_30: activeDays30,
    last_active_at: arch.login && lastActive ? `${lastActive}T11:00:00.000Z` : null,
  }
  s.overall_band = worst([participation.band, outcomes.band])
  s.reasons = studentReasons(s, student.name.split(' ')[0])

  const prodigy = arch.skill != null && index % 3 === 0
    ? Object.fromEntries(['A', 'C', 'I', 'L', 'M', 'S'].map((k) => [k, Math.round(Math.max(10, Math.min(98, arch.skill * 100 + (r() - 0.5) * 40)))]))
    : null

  const detail = {
    run_id: batch.run_id,
    batch_id: batch.batch_id,
    username: student.username,
    classes: detailClasses
      .filter((c) => c._enrolled)
      .map((c) => {
        const row = { ...c }
        delete row._enrolled
        return row
      }),
    activity,
    prodigy,
  }
  return { student: s, detail }
}

function buildBatch(batch, roster, classes) {
  const scheduled = classes.length
  const held = classes.filter((c) => c.status !== 'CANCELLED').length
  const deliveryPct = pct(held, scheduled)
  const participation = rollup(roster, 'participation')
  participation.not_started = roster.filter((s) => s.participation.not_started).length
  const due = roster.reduce((sum, s) => sum + s.participation.due, 0)
  participation.completion_pct = pct(roster.reduce((sum, s) => sum + s.participation.done, 0), due)
  const outcomes = rollup(roster, 'outcomes')
  const avg = (vals) => (vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null)
  outcomes.avg_assessment_pct = avg(roster.map((s) => s.outcomes.avg_assessment_pct).filter((v) => v != null))
  outcomes.code_run_pct = avg(roster.map((s) => s.outcomes.code_run_pct).filter((v) => v != null))
  const present = roster.reduce((sum, s) => sum + s.attendance.present, 0)
  const heldSum = roster.reduce((sum, s) => sum + s.attendance.held, 0)
  const attendancePct = pct(present, heldSum)
  const delivery = { scheduled, held, pct: deliveryPct, band: scheduled ? band(deliveryPct, HEALTH_THRESHOLDS.delivery) : 'N' }
  const reds = [participation.band, outcomes.band].filter((b) => b === 'R').length + (delivery.band === 'R' ? 1 : 0)
  const overall = delivery.band === 'R' || reds >= 2
    ? 'R'
    : delivery.band === 'G' && participation.band === 'G' && outcomes.band === 'G' ? 'G' : 'A'

  const reasons = [`Delivery ${deliveryPct}% — ${held} of ${scheduled} classes held`]
  if (participation.R) reasons.push(`${participation.R} of ${roster.length} students are Red on workouts (${participation.not_started} not started)`)
  if (outcomes.R) reasons.push(`${outcomes.R} of ${roster.length} students are Red on outcomes`)

  return {
    run_id: batch.run_id,
    batch_id: batch.batch_id,
    batch_name: batch.batch_name,
    grade: batch.grade,
    school_id: batch.school_id,
    school_name: batch.school_name,
    teacher: batch.teacher,
    start_date: batch.start_date,
    batch_state: 'ACTIVE',
    students: roster.length,
    delivery,
    participation,
    outcomes,
    attendance: { pct: attendancePct, band: band(attendancePct, HEALTH_THRESHOLDS.attendance) },
    overall_band: overall,
    reasons,
  }
}

/**
 * @param {object} opts
 * @param {Array<{batch_id,batch_name,grade,school_id,school_name,start_date?,cancel_rate?,students:Array<{username,name}>}>} opts.batches
 * @param {{username:string,name:string}} opts.teacher
 * @param {string} [opts.asOf] YYYY-MM-DD
 * @param {string} [opts.runId]
 */
export function buildHealthSnapshot({ batches, teacher, asOf = '2026-09-18', runId = 'demo-run-2026-09-18' }) {
  const asOfDate = new Date(`${asOf}T00:00:00Z`)
  const run = {
    _id: runId,
    generated_at: `${asOf}T21:30:00.000Z`,
    data_as_of: asOf,
    source: 'growth-poc',
    window: { from: '2026-04-01', to: asOf },
    thresholds: HEALTH_THRESHOLDS,
    is_latest: true,
    counts: { schools: new Set(batches.map((b) => b.school_id)).size, batches: batches.length, students: 0 },
  }
  const out = { run, batches: [], students: [], details: [] }
  batches.forEach((raw, bi) => {
    const batch = {
      start_date: '2026-06-08',
      cancel_rate: [0.04, 0.2, 0.34][bi % 3],
      ...raw,
      run_id: runId,
      teacher,
    }
    const classes = buildClasses(batch, asOfDate, rng(`classes:${batch.batch_id}`))
    const built = batch.students.map((st, i) => buildStudent(batch, st, i + bi, classes, asOfDate))
    const roster = built.map((b) => b.student)
    // Same rule as the real builder: assessments batch-mates took that this student has not.
    const held = new Set(roster.flatMap((st) => st.outcomes.assessments.map((a) => a.session_id)))
    for (const st of roster) {
      const taken = new Set(st.outcomes.assessments.map((a) => a.session_id))
      st.outcomes.pending_assessments = [...held].filter((id) => !taken.has(id)).length
    }
    out.students.push(...roster)
    out.details.push(...built.map((b) => b.detail))
    const batchDoc = buildBatch(batch, roster, classes)
    batchDoc.pending_assessment = roster.filter((st) => st.outcomes.pending_assessments > 0).length
    batchDoc.not_logged_in = roster.filter((st) => !st.login.ever_logged_in).length
    out.batches.push(batchDoc)
  })
  run.counts.students = out.students.length
  return out
}
