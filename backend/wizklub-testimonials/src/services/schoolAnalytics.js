import { WIZKLUB_URLS } from '../utils/wizklubAuth.js'
import {
  fetchAllBatchesForSchool,
  filterByInstructorBatchIds,
} from './batchSync.js'
import { fetchBatchProgressOverview } from './completionAnalytics.js'
import {
  ACADEMIC_YEAR_BATCH_SCOPE,
  filterActiveBatches,
  filterBatchesForAcademicYear,
} from '../utils/academicYearBatches.js'
import { getHealthBatchMapForSchool, getWorkoutTotalsForBatchIds } from './health.js'

const STUDENT_PAGE_SIZE = '100'
const MAX_STUDENT_PAGES = 50
const OVERVIEW_CONCURRENCY = 4

function authHeaders(accessToken) {
  const headers = { accept: 'application/json' }
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`
  return headers
}

function wizklubAuthError(status, message) {
  const err = new Error(message || `WizKlub auth failed (${status})`)
  err.status = status
  err.code = 'WIZKLUB_AUTH'
  return err
}

function roundPct(numerator, denominator) {
  if (!denominator || denominator <= 0) return 0
  return Math.round((numerator / denominator) * 10000) / 100
}

function studentCompletionsFromItem(item, studentCount) {
  if (item?.completed != null && item.completed !== '') {
    return Math.max(0, Number(item.completed) || 0)
  }
  const conducted = Number(item?.conducted) || 0
  const completion = Number(item?.completion) || 0
  const students = Number(studentCount) || 0
  if (conducted <= 0 || students <= 0) return 0
  return Math.round((completion / 100) * students * conducted)
}

async function mapPool(items, concurrency, mapper) {
  const results = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await mapper(items[index], index)
    }
  }
  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(items.length, 1)) },
    () => worker(),
  )
  await Promise.all(workers)
  return results
}

export async function fetchSchoolSummary(schoolId, accessToken) {
  const url = WIZKLUB_URLS.schoolSummary(schoolId)
  const response = await fetch(url, { headers: authHeaders(accessToken) })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message =
      payload?.message || payload?.error || `WizKlub school summary failed (${response.status})`
    const err = new Error(message)
    err.status = response.status
    throw err
  }
  return payload?.data ?? payload
}

function schoolIdAlternates(schoolId) {
  const id = String(schoolId || '').trim()
  if (!id) return []
  const out = [id]
  if (/^beng/i.test(id)) out.push(id.replace(/^beng/i, 'bang'))
  if (/^bang/i.test(id)) out.push(id.replace(/^bang/i, 'beng'))
  return [...new Set(out)]
}

function kpiScore(summary) {
  const kpis = summary?.kpis || {}
  return (
    (Number(kpis.total_students) || 0) * 1000 +
    (Number(kpis.students_not_logged_in) || 0) * 10 +
    (Number(kpis.total_batches) || 0)
  )
}

export async function fetchBestSchoolSummary(schoolId, accessToken) {
  let best = null
  let bestId = schoolId
  for (const id of schoolIdAlternates(schoolId)) {
    try {
      const summary = await fetchSchoolSummary(id, accessToken)
      if (!best || kpiScore(summary) > kpiScore(best)) {
        best = summary
        bestId = id
      }
    } catch (err) {
      console.warn(`[SchoolAnalytics] school summary ${id}:`, err.message)
    }
  }
  if (!best) {
    const err = new Error(`No school summary for ${schoolId}`)
    err.status = 404
    throw err
  }
  return { summary: best, schoolId: bestId }
}

async function fetchNotLoggedInStudentsPage(
  schoolId,
  accessToken,
  { cursor = null, batchId = null } = {},
) {
  const params = new URLSearchParams({
    school_id: schoolId,
    page_size: STUDENT_PAGE_SIZE,
    login_status: 'not_logged_in',
  })
  if (batchId) params.set('batch_id', batchId)
  if (cursor) params.set('cursor', cursor)

  const url = `${WIZKLUB_URLS.batchStudents}?${params}`
  const response = await fetch(url, { headers: authHeaders(accessToken) })
  if (!response.ok) {
    console.error(
      `[SchoolAnalytics] not-logged-in students school=${schoolId} batch=${batchId || '-'} → ${response.status}`,
    )
    if (response.status === 401 || response.status === 403) {
      throw wizklubAuthError(
        response.status,
        response.status === 401
          ? 'Invalid or expired WizKlub token'
          : 'Not allowed to load not-logged-in students',
      )
    }
    return null
  }
  return response.json()
}

function extractNotLoggedInStudents(payload) {
  const raw =
    payload?.data?.students ||
    payload?.data?.student_list ||
    payload?.data?.items ||
    payload?.students ||
    []
  if (!Array.isArray(raw)) return []
  return raw.map((s) => ({
    id: s.username ?? s.student_id ?? s.id,
    full_name: s.name ?? s.student_name ?? s.full_name ?? 'Unknown',
    roll_number: s.admission_no ?? s.roll_number ?? s.username ?? '',
    batch_id: s.batch_id ?? null,
    batch_name: s.batch_name ?? null,
    grade: s.grade ?? null,
    is_logged_in: Boolean(s.is_logged_in),
  }))
}

export async function listSchoolBatchesForTeacher(
  schoolId,
  { accessToken, instructorUsername, batchIds } = {},
) {
  const instructorBatches = await fetchAllBatchesForSchool(
    schoolId,
    instructorUsername,
    accessToken,
  )
  const scoped = filterByInstructorBatchIds(instructorBatches, batchIds)
  const healthMap = await getHealthBatchMapForSchool(schoolId)
  const healthIds = healthMap ? new Set(healthMap.keys()) : null
  const ayFiltered = filterBatchesForAcademicYear(scoped, { healthBatchIds: healthIds ?? healthMap })
  const filtered = filterActiveBatches(ayFiltered, { healthBatchMap: healthMap })
  if (filtered.length < scoped.length) {
    console.info(
      `[SchoolAnalytics] AY2026 active batch filter school=${schoolId}: ${filtered.length}/${scoped.length} batches`,
    )
  }
  return filtered
}

export async function fetchAllNotLoggedInStudents(
  schoolId,
  accessToken,
  { allowedBatchIds = null } = {},
) {
  const merged = []
  const seen = new Set()
  let cursor = null
  let pages = 0
  const batchFilterActive = allowedBatchIds != null
  const batchFilter =
    allowedBatchIds instanceof Set
      ? allowedBatchIds
      : Array.isArray(allowedBatchIds)
        ? new Set(allowedBatchIds.map(String))
        : new Set()

  do {
    const payload = await fetchNotLoggedInStudentsPage(schoolId, accessToken, { cursor })
    if (!payload) break
    for (const student of extractNotLoggedInStudents(payload)) {
      if (batchFilterActive) {
        const bid = student.batch_id != null ? String(student.batch_id) : ''
        if (!bid || !batchFilter.has(bid)) continue
      }
      const key = String(student.id || '').toLowerCase()
      if (!key || seen.has(key)) continue
      seen.add(key)
      merged.push(student)
    }
    const pageInfo = payload?.data?.page_info
    if (pageInfo?.has_next_page && pageInfo?.next_cursor) {
      cursor = pageInfo.next_cursor
    } else {
      cursor = null
    }
    pages += 1
  } while (cursor && pages < MAX_STUDENT_PAGES)

  return {
    school_id: schoolId,
    total: merged.length,
    students: merged,
  }
}

export async function buildLoginSummary(
  schoolId,
  { accessToken, instructorUsername, batchIds, schoolName } = {},
) {
  const batches = await listSchoolBatchesForTeacher(schoolId, {
    accessToken,
    instructorUsername,
    batchIds,
  })

  const allowedBatchIds = new Set(batches.map((b) => String(b.id)))
  let totalBatches = batches.length
  let totalStudents = batches.reduce((sum, b) => sum + (Number(b.student_count) || 0), 0)
  let notLoggedIn = batches.reduce((sum, b) => sum + (Number(b.not_logged_in_count) || 0), 0)
  let region = null
  let resolvedName = schoolName || schoolId
  let source = 'teacher_batches'

  try {
    const best = await fetchBestSchoolSummary(schoolId, accessToken)
    const summary = best.summary
    resolvedName = summary?.school?.name || resolvedName
    region = summary?.school?.city || null
  } catch (err) {
    console.warn(`[SchoolAnalytics] school summary fallback for ${schoolId}:`, err.message)
  }

  try {
    const roster = await fetchAllNotLoggedInStudents(schoolId, accessToken, { allowedBatchIds })
    notLoggedIn = Number(roster.total) || 0
    source = 'not_logged_in_students'
  } catch (err) {
    if (err?.code === 'WIZKLUB_AUTH' || err?.status === 401 || err?.status === 403) {
      throw err
    }
    console.warn(`[SchoolAnalytics] not-logged-in roster for ${schoolId}:`, err.message)
  }

  const loggedIn = Math.max(totalStudents - notLoggedIn, 0)
  const notLoginRate = roundPct(notLoggedIn, totalStudents)

  return {
    school_id: schoolId,
    school_name: resolvedName,
    region,
    total_batches: totalBatches,
    total_students: totalStudents,
    not_logged_in: notLoggedIn,
    students_not_logged_in: notLoggedIn,
    logged_in: loggedIn,
    not_login_rate: notLoginRate,
    source,
    batches: batches.map((b) => ({
      batch_id: b.id,
      batch_name: b.name,
      student_count: Number(b.student_count) || 0,
      not_logged_in_count: Number(b.not_logged_in_count) || 0,
      attendance_percentage: b.attendance_percentage,
      status: b.status,
      start_date: b.start_date ?? null,
    })),
    batch_scope: ACADEMIC_YEAR_BATCH_SCOPE,
  }
}

function emptyTrackerBuckets() {
  return {
    Lab: { key: 'Lab', label: 'Practical Lab Sessions', planned: 0, conducted: 0, deliverySum: 0, completionSum: 0, n: 0 },
    Lecture: { key: 'Lecture', label: 'Theory & Lectures', planned: 0, conducted: 0, deliverySum: 0, completionSum: 0, n: 0 },
    Assessment: { key: 'Assessment', label: 'Monthly Assessments', planned: 0, conducted: 0, deliverySum: 0, completionSum: 0, n: 0 },
  }
}

export async function buildExecutionCompletion(
  schoolId,
  { accessToken, instructorUsername, batchIds, periodType = 'MONTHLY' } = {},
) {
  const batches = await listSchoolBatchesForTeacher(schoolId, {
    accessToken,
    instructorUsername,
    batchIds,
  })

  const overviews = await mapPool(batches, OVERVIEW_CONCURRENCY, async (batch) => {
    try {
      const overview = await fetchBatchProgressOverview(batch.id, accessToken, {
        periodType,
        limit: 10,
      })
      return { batch, overview, error: null }
    } catch (err) {
      console.warn(`[SchoolAnalytics] progress-overview ${batch.id}:`, err.message)
      return { batch, overview: null, error: err.message }
    }
  })

  const sessionTotals = { total: 0, done: 0, missed: 0, cancelled: 0 }
  const buckets = emptyTrackerBuckets()
  const batchRows = []

  for (const row of overviews) {
    const { batch, overview } = row
    const session = overview?.session_summary || {}
    const trackerItems = Array.isArray(overview?.completion_tracker?.items)
      ? overview.completion_tracker.items
      : []

    sessionTotals.total += Number(session.total) || 0
    sessionTotals.done += Number(session.done) || 0
    sessionTotals.missed += Number(session.missed) || 0
    sessionTotals.cancelled += Number(session.cancelled) || 0

    const byKey = {
      Lab: { delivery: 0, completion: 0, planned: 0, conducted: 0, completed: 0 },
      Lecture: { delivery: 0, completion: 0, planned: 0, conducted: 0, completed: 0 },
      Assessment: { delivery: 0, completion: 0, planned: 0, conducted: 0, completed: 0 },
    }

    const trackerStudentCount =
      Number(overview?.completion_tracker?.student_count) || Number(batch.student_count) || 0

    for (const item of trackerItems) {
      const key = item.key || ''
      if (!buckets[key]) continue
      const planned = Number(item.planned) || 0
      const conducted = Number(item.conducted) || 0
      const delivery = Number(item.delivery) || 0
      const completion = Number(item.completion) || 0
      const completed = studentCompletionsFromItem(item, trackerStudentCount)
      buckets[key].planned += planned
      buckets[key].conducted += conducted
      buckets[key].deliverySum += delivery
      buckets[key].completionSum += completion
      buckets[key].n += 1
      if (item.label) buckets[key].label = item.label
      byKey[key] = { delivery, completion, planned, conducted, completed }
    }

    const studentsCompletedSum =
      byKey.Lab.completed + byKey.Lecture.completed + byKey.Assessment.completed
    const completionSamples = trackerItems
      .map((i) => Number(i.completion) || 0)
      .filter((_, idx) => trackerItems[idx]?.key && buckets[trackerItems[idx].key])
    const overallCompletion =
      completionSamples.length > 0
        ? Math.round(
            (completionSamples.reduce((a, b) => a + b, 0) / completionSamples.length) * 100,
          ) / 100
        : 0

    batchRows.push({
      batch_id: batch.id,
      batch_name: batch.name,
      student_count: Number(batch.student_count) || trackerStudentCount || 0,
      completed_sessions: studentsCompletedSum,
      students_completed: studentsCompletedSum,
      completion_pct: overallCompletion,
      by_type: byKey,
      session_summary: {
        total: Number(session.total) || 0,
        done: Number(session.done) || 0,
        missed: Number(session.missed) || 0,
        cancelled: Number(session.cancelled) || 0,
      },
      error: row.error,
    })
  }

  const completion_tracker = Object.values(buckets).map((b) => ({
    key: b.key,
    label: b.label,
    planned: b.planned,
    conducted: b.conducted,
    delivery: b.n > 0 ? Math.round((b.deliverySum / b.n) * 100) / 100 : 0,
    completion: b.n > 0 ? Math.round((b.completionSum / b.n) * 100) / 100 : 0,
  }))

  const workoutTotals = await getWorkoutTotalsForBatchIds(batchRows.map((b) => b.batch_id))
  for (const row of batchRows) {
    const w = workoutTotals.get(String(row.batch_id))
    row.workouts = w ?? { completed: 0, in_progress: 0, not_started: 0 }
  }

  return {
    school_id: schoolId,
    period_type: periodType,
    batch_scope: ACADEMIC_YEAR_BATCH_SCOPE,
    session_summary: {
      ...sessionTotals,
      period_type: periodType,
      teacher_execution_pct: roundPct(sessionTotals.done, sessionTotals.total),
    },
    completion_tracker,
    batches: batchRows,
    failed_batches: batchRows.filter((b) => b.error).length,
  }
}
