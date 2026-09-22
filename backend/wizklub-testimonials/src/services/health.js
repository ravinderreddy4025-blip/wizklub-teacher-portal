/**
 * Student health — read-only access to the nightly health snapshot (db `wizklub_health`,
 * see HEALTH_CONTRACT v1). The snapshot is produced by backend/health-snapshot; this
 * service never writes to it.
 */
import mongoose from 'mongoose'
import { config } from '../config.js'
import { isDatabaseReady } from '../db/state.js'

const HIDDEN = { _id: 0 }

function healthDb() {
  if (!isDatabaseReady() || mongoose.connection.readyState !== 1) return null
  // Shares the main connection pool; `useCache` keeps a single handle per db name.
  return mongoose.connection.useDb(config.healthMongoDbName, { useCache: true })
}

function col(db, name) {
  return db.collection(name)
}

/** Snapshot ids may be stored as strings or numbers — match both. */
function idVariants(value) {
  const str = String(value ?? '').trim()
  const out = [str]
  if (/^\d+$/.test(str)) out.push(Number(str))
  return out
}

export async function getLatestRun() {
  const db = healthDb()
  if (!db) return null
  const run = await col(db, 'health_runs').findOne({ is_latest: true }, { sort: { generated_at: -1 } })
  if (!run) return null
  return {
    id: run._id,
    generated_at: run.generated_at ?? null,
    data_as_of: run.data_as_of ?? null,
    source: run.source ?? null,
    window: run.window ?? null,
    thresholds: run.thresholds ?? null,
    counts: run.counts ?? null,
  }
}

/** Assessment session ids any student in the roster has taken (the batch's "held" assessments). */
export function batchAssessmentIds(students) {
  const ids = new Set()
  for (const s of students) {
    for (const a of s?.outcomes?.assessments ?? []) {
      if (a?.session_id) ids.add(String(a.session_id))
    }
  }
  return ids
}

/** True when the student missed at least one assessment the rest of the batch has taken. */
export function isPendingAssessment(student, heldIds) {
  // The snapshot builder stores its own count (same rule); prefer it when present.
  const given = student?.outcomes?.pending_assessments
  if (typeof given === 'number') return given > 0
  if (!heldIds.size) return false
  const taken = new Set((student?.outcomes?.assessments ?? []).map((a) => String(a?.session_id)))
  for (const id of heldIds) if (!taken.has(id)) return true
  return false
}

export async function getBatchHealth(batchId) {
  const run = await getLatestRun()
  if (!run) return { run: null }
  const db = healthDb()
  const batchIds = idVariants(batchId)
  const [batch, students] = await Promise.all([
    col(db, 'health_batches').findOne({ run_id: run.id, batch_id: { $in: batchIds } }, { projection: HIDDEN }),
    col(db, 'health_students')
      .find({ run_id: run.id, batch_id: { $in: batchIds } }, { projection: HIDDEN })
      .sort({ name: 1 })
      .toArray(),
  ])
  return { run, batch: batch ?? null, students }
}

export async function getStudentHealth(batchId, username) {
  const run = await getLatestRun()
  if (!run) return { run: null }
  const db = healthDb()
  const filter = { run_id: run.id, batch_id: { $in: idVariants(batchId) }, username: { $in: idVariants(username) } }
  const [batch, student, detail] = await Promise.all([
    col(db, 'health_batches').findOne({ run_id: run.id, batch_id: filter.batch_id }, { projection: HIDDEN }),
    col(db, 'health_students').findOne(filter, { projection: HIDDEN }),
    col(db, 'health_student_details').findOne(filter, { projection: HIDDEN }),
  ])
  return { run, batch: batch ?? null, student: student ?? null, detail: detail ?? null }
}

/**
 * Dashboard "students needing attention" for one teacher.
 * Scope: batches taught by the teacher (snapshot teacher.username) or in the session's batch ids;
 * falls back to the session's schools when neither matches (mirrors teacherOwnsBatch's school scope).
 */
export async function getAttention({ teacherUsername, batchIds = [], schoolIds = [] }) {
  const run = await getLatestRun()
  if (!run) return { run: null }
  const db = healthDb()
  const batchesCol = col(db, 'health_batches')
  const projection = { _id: 0, batch_id: 1, batch_name: 1, school_id: 1, school_name: 1, students: 1, overall_band: 1 }

  const or = []
  if (teacherUsername) or.push({ 'teacher.username': teacherUsername })
  const sessionBatchIds = batchIds.flatMap(idVariants)
  if (sessionBatchIds.length) or.push({ batch_id: { $in: sessionBatchIds } })

  let batches = or.length ? await batchesCol.find({ run_id: run.id, $or: or }, { projection }).toArray() : []
  if (batches.length === 0 && schoolIds.length) {
    batches = await batchesCol
      .find({ run_id: run.id, school_id: { $in: schoolIds.flatMap(idVariants) } }, { projection })
      .toArray()
  }
  if (batches.length === 0) return { run, batches: [] }

  const students = await col(db, 'health_students')
    .find(
      { run_id: run.id, batch_id: { $in: batches.map((b) => b.batch_id) } },
      {
        projection: {
          _id: 0,
          batch_id: 1,
          overall_band: 1,
          'participation.not_started': 1,
          'outcomes.assessments.session_id': 1,
          'outcomes.pending_assessments': 1,
        },
      },
    )
    .toArray()

  const byBatch = new Map()
  for (const s of students) {
    const key = String(s.batch_id)
    if (!byBatch.has(key)) byBatch.set(key, [])
    byBatch.get(key).push(s)
  }

  const rows = batches.map((b) => {
    const roster = byBatch.get(String(b.batch_id)) ?? []
    const held = batchAssessmentIds(roster)
    return {
      batch_id: b.batch_id,
      batch_name: b.batch_name,
      school_id: b.school_id,
      school_name: b.school_name,
      overall_band: b.overall_band ?? null,
      students: roster.length || b.students || 0,
      red: roster.filter((s) => s.overall_band === 'R').length,
      not_started: roster.filter((s) => s.participation?.not_started).length,
      pending_assessment: roster.filter((s) => isPendingAssessment(s, held)).length,
    }
  })

  rows.sort((a, b) => b.red - a.red || b.not_started - a.not_started || String(a.batch_name).localeCompare(String(b.batch_name)))
  return { run, batches: rows }
}
