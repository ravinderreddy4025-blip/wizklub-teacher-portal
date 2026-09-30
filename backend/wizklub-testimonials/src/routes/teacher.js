import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import {
  getBatchById,
  getSchoolById,
  getStudentById,
  getStudentsForBatch,
  getUploadsForStudent,
  getBatchUpload,
  teacherOwnsStudent,
  teacherOwnsBatch,
  getAllUploads,
  getBatchesForSchool,
} from '../services/access.js'
import { syncSchoolsAndBatches } from '../services/schoolSync.js'
import { resolveSchoolIds, resolveSchoolWithBatches } from '../services/schoolResolve.js'
import { getSession } from '../services/sessionStore.js'
import { fetchTeacherLmsTime } from '../services/lmsTime.js'
import { fetchBatchProgressOverview } from '../services/completionAnalytics.js'
import { fetchBatchFeedbackSummary } from '../services/feedbackSummary.js'
import { fetchAllStudentsForBatch } from '../services/studentSync.js'
import {
  buildLoginSummary,
  fetchAllNotLoggedInStudents,
  buildExecutionCompletion,
} from '../services/schoolAnalytics.js'
import {
  getBatchCompletion,
  getStudentCompletion,
} from '../services/uploads.js'
import { listBatchUploads } from '../services/batchUploads.js'
import { HEALTH_TAG_LABELS, UPLOAD_STATUS } from '../utils/constants.js'

export function createTeacherRouter() {
  const router = Router()
  router.use(requireAuth)

  router.get('/dashboard', async (req, res) => {
    let schoolIds = await resolveSchoolIds(req.teacher.user_id, req.schoolIds)

    if (schoolIds.length === 0) {
      const session = getSession(req.accessToken)
      if (session?.schoolIds?.length) {
        try {
          await syncSchoolsAndBatches(req.teacher.user_id, session.schoolIds, session.batchIds ?? [], req.accessToken, session.userId)
          schoolIds = await resolveSchoolIds(req.teacher.user_id, session.schoolIds)
        } catch (err) {
          console.error('Lazy school sync failed:', err.message)
          schoolIds = session.schoolIds
        }
      }
    }

    const uploads = await getAllUploads()
    const instructorUsername = req.teacher.user_id

    const schools = []
    const allStudentIds = new Set()

    for (const schoolId of schoolIds) {
      const { school, batches: schoolBatches } = await resolveSchoolWithBatches(schoolId, {
        accessToken: req.accessToken,
        instructorUsername,
        batchIds: req.batchIds,
      })
      if (!school) continue

      for (const batch of schoolBatches) {
        const students = await fetchAllStudentsForBatch(schoolId, batch._id, req.accessToken)
        students.forEach((s) => allStudentIds.add(s.id))
      }

      schools.push({
        id: school._id,
        name: school.name,
        batch_count: schoolBatches.length,
        student_count: schoolBatches.reduce((sum, b) => sum + (b.student_count ?? 0), 0),
      })
    }

    const totalStudents = allStudentIds.size

    const studentsWithUploads = new Set(
      uploads
        .filter((u) => allStudentIds.has(u.student_id))
        .map((u) => u.student_id),
    ).size

    const pendingStudents = totalStudents - studentsWithUploads

    res.json({
      teacher: { full_name: req.teacher.full_name },
      stats: {
        total_students: totalStudents,
        testimonials_uploaded: studentsWithUploads,
        pending_students: pendingStudents,
      },
      schools,
    })
  })

  router.get('/schools', async (req, res) => {
    const schoolIds = await resolveSchoolIds(req.teacher.user_id, req.schoolIds)
    const schools = []
    for (const schoolId of schoolIds) {
      const { school, batches: schoolBatches } = await resolveSchoolWithBatches(schoolId, {
        accessToken: req.accessToken,
        instructorUsername: req.teacher.user_id,
        batchIds: req.batchIds,
      })
      if (!school) continue
      const studentCountFromBatches = schoolBatches.reduce(
        (sum, b) => sum + (b.student_count ?? 0), 0,
      )
      schools.push({
        id: school._id,
        name: school.name,
        batch_count: schoolBatches.length,
        student_count: studentCountFromBatches,
      })
    }
    res.json(schools)
  })

  router.get('/schools/:schoolId/batches', async (req, res) => {
    const { schoolId } = req.params
    const schoolIds = await resolveSchoolIds(req.teacher.user_id, req.schoolIds)

    if (!schoolIds.includes(schoolId)) {
      return res.status(403).json({ forbidden: true })
    }

    const instructorUsername = req.teacher.user_id
    const { school, batches: schoolBatches } = await resolveSchoolWithBatches(schoolId, {
      accessToken: req.accessToken,
      instructorUsername,
      batchIds: req.batchIds,
    })

    const uploads = await getAllUploads()
    const batches = []

    const batchSources =
      schoolBatches.length > 0 ? schoolBatches : await getBatchesForSchool(schoolId, req.teacher.user_id)

    for (const batch of batchSources) {
      const batchId = batch._id
      const students = await fetchAllStudentsForBatch(schoolId, batchId, req.accessToken)
      const studentIds = students.map((s) => s.id)
      const { completion_avg, health_tag } = getBatchCompletion(uploads, studentIds)

      batches.push({
        id: batchId,
        name: batch.name,
        student_count: students.length > 0 ? students.length : (batch.student_count ?? 0),
        student_ids: studentIds,
        completion_avg,
        health_tag,
        health_label: HEALTH_TAG_LABELS[health_tag],
      })
    }

    res.json({
      school: { id: school._id, name: school.name },
      batches,
    })
  })

  router.get('/schools/:schoolId/login-summary', async (req, res) => {
    const { schoolId } = req.params
    const schoolIds = await resolveSchoolIds(req.teacher.user_id, req.schoolIds)
    if (!schoolIds.includes(schoolId)) {
      return res.status(403).json({ forbidden: true })
    }

    try {
      const { school } = await resolveSchoolWithBatches(schoolId, {
        accessToken: req.accessToken,
        instructorUsername: req.teacher.user_id,
        batchIds: req.batchIds,
      })
      const summary = await buildLoginSummary(schoolId, {
        accessToken: req.accessToken,
        instructorUsername: req.teacher.user_id,
        batchIds: req.batchIds,
        schoolName: school?.name,
      })
      return res.json(summary)
    } catch (err) {
      console.error(`[LoginSummary] ${schoolId}:`, err.message)
      return res.status(err.status && err.status >= 400 ? err.status : 502).json({
        error: err.message || 'Failed to load login summary from WizKlub.',
      })
    }
  })

  router.get('/schools/:schoolId/not-logged-in-students', async (req, res) => {
    const { schoolId } = req.params
    const schoolIds = await resolveSchoolIds(req.teacher.user_id, req.schoolIds)
    if (!schoolIds.includes(schoolId)) {
      return res.status(403).json({ forbidden: true })
    }

    try {
      const result = await fetchAllNotLoggedInStudents(schoolId, req.accessToken)
      return res.json(result)
    } catch (err) {
      console.error(`[NotLoggedInStudents] ${schoolId}:`, err.message)
      return res.status(err.status && err.status >= 400 ? err.status : 502).json({
        error: err.message || 'Failed to load not-logged-in students from WizKlub.',
      })
    }
  })

  router.get('/schools/:schoolId/execution-completion', async (req, res) => {
    const { schoolId } = req.params
    const periodType = String(req.query.period_type || 'MONTHLY').toUpperCase()
    const schoolIds = await resolveSchoolIds(req.teacher.user_id, req.schoolIds)
    if (!schoolIds.includes(schoolId)) {
      return res.status(403).json({ forbidden: true })
    }

    try {
      const result = await buildExecutionCompletion(schoolId, {
        accessToken: req.accessToken,
        instructorUsername: req.teacher.user_id,
        batchIds: req.batchIds,
        periodType,
      })
      return res.json(result)
    } catch (err) {
      console.error(`[ExecutionCompletion] ${schoolId}:`, err.message)
      return res.status(err.status && err.status >= 400 ? err.status : 502).json({
        error: err.message || 'Failed to load execution/completion from WizKlub.',
      })
    }
  })

  router.get('/batches/:batchId/progress-overview', async (req, res) => {
    const { batchId } = req.params
    const periodType = String(req.query.period_type || 'MONTHLY').toUpperCase()
    const limit = Number(req.query.limit) || 10
    const owns = await teacherOwnsBatch(req.teacher.user_id, batchId, {
      batchIds: req.batchIds,
      schoolIds: req.schoolIds,
    })
    if (!owns) {
      return res.status(403).json({ forbidden: true })
    }

    try {
      const summary = await fetchBatchProgressOverview(batchId, req.accessToken, {
        periodType,
        limit,
      })
      return res.json(summary)
    } catch (err) {
      console.error(`[ProgressOverview] ${batchId}:`, err.message)
      return res.status(err.status && err.status >= 400 ? err.status : 502).json({
        error: err.message || 'Failed to load progress overview from WizKlub.',
      })
    }
  })

  router.get('/lms-time', async (req, res) => {
    try {
      const summary = await fetchTeacherLmsTime(req.teacherEmail)
      return res.json(summary)
    } catch (err) {
      console.error('[LmsTime]', err.message)
      return res.status(err.status && err.status >= 400 ? err.status : 502).json({
        error: err.message || 'Failed to load LMS time tracking.',
        configured: true,
      })
    }
  })

  router.get('/batches/:batchId/feedback-summary', async (req, res) => {
    const { batchId } = req.params
    const owns = await teacherOwnsBatch(req.teacher.user_id, batchId, {
      batchIds: req.batchIds,
      schoolIds: req.schoolIds,
    })
    if (!owns) {
      return res.status(403).json({ forbidden: true })
    }

    try {
      const summary = await fetchBatchFeedbackSummary(batchId, req.accessToken)
      return res.json(summary)
    } catch (err) {
      console.error(`[FeedbackSummary] ${batchId}:`, err.message)
      return res.status(err.status && err.status >= 400 ? err.status : 502).json({
        error: err.message || 'Failed to load feedback summary from WizKlub.',
      })
    }
  })

  /** Total upload file records for a batch (student uploads + batch group uploads). */
  router.get('/batches/:batchId/upload-stats', async (req, res) => {
    const { batchId } = req.params
    const owns = await teacherOwnsBatch(req.teacher.user_id, batchId, {
      batchIds: req.batchIds,
      schoolIds: req.schoolIds,
    })
    if (!owns) {
      return res.status(403).json({ forbidden: true })
    }

    const batch = await getBatchById(batchId)
    const schoolId = batch?.school_id || String(req.query.school_id ?? '').trim()
    if (!schoolId) {
      return res.status(400).json({ error: 'school_id is required to load upload stats.' })
    }

    const students = await fetchAllStudentsForBatch(schoolId, batchId, req.accessToken)
    const studentIds = new Set(students.map((s) => s.id))
    const studentNameById = new Map(students.map((s) => [s.id, s.full_name || s.id]))

    const uploads = await getAllUploads()
    const studentUploads = uploads.filter((u) => studentIds.has(u.student_id))
    const batchGroupUploads = await listBatchUploads(batchId)
    const totalUploads = studentUploads.length + batchGroupUploads.length

    const recent = studentUploads
      .slice()
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
      .slice(0, 4)
      .map((u) => {
        const name = studentNameById.get(u.student_id) || u.student_id || '?'
        const parts = String(name).trim().split(/\s+/).filter(Boolean)
        const initials = parts.length >= 2
          ? `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase()
          : String(name).slice(0, 2).toUpperCase()
        return { initials, label: name }
      })

    return res.json({
      total_uploads: totalUploads,
      student_uploads: studentUploads.length,
      batch_uploads: batchGroupUploads.length,
      recent,
      extra: Math.max(totalUploads - recent.length, 0),
    })
  })

  router.get('/batches/:batchId/students', async (req, res) => {
    const { batchId } = req.params
    const filter = req.query.filter ?? 'all'
    const querySchoolId = String(req.query.school_id ?? '').trim()
    const batch = await getBatchById(batchId)
    const schoolId = querySchoolId || batch?.school_id || ''

    if (!schoolId) {
      return res.status(400).json({ error: 'school_id is required to load students.' })
    }

    const schoolIds = await resolveSchoolIds(req.teacher.user_id, req.schoolIds)
    if (!schoolIds.includes(schoolId)) {
      return res.status(403).json({ forbidden: true })
    }

    const apiStudents = await fetchAllStudentsForBatch(schoolId, batchId, req.accessToken)
    const uploads = await getAllUploads()

    const mapStudents = (rows) =>
      rows
        .map((s) => {
          const completion = getStudentCompletion(uploads, s.id)
          return {
            id: s.id,
            full_name: s.full_name,
            roll_number: s.roll_number,
            image: s.image,
            completion_pct: completion.completion_pct,
            status: completion.status,
            categories_done: completion.categories_done,
            categories_total: completion.categories_total,
          }
        })
        .filter((student) => {
          if (filter === 'uploaded') return student.completion_pct === 100
          if (filter === 'pending') return student.completion_pct < 100
          return true
        })

    if (apiStudents.length > 0) {
      const batchName = batch?.name ?? apiStudents[0]?.batch_name ?? batchId

      return res.json({
        batch: {
          id: batchId,
          name: batchName,
          school_id: schoolId,
        },
        batch_upload: await getBatchUpload(batchId),
        students: mapStudents(apiStudents),
      })
    }

    let batchName = batch?.name ?? batchId
    if (!batch) {
      const { batches: schoolBatches } = await resolveSchoolWithBatches(schoolId, {
        accessToken: req.accessToken,
        instructorUsername: req.teacher.user_id,
        batchIds: req.batchIds,
      })
      const matched = schoolBatches.find((b) => String(b._id) === String(batchId))
      if (matched) batchName = matched.name
    }

    if (!batch && !batchName) {
      return res.status(404).json({ error: 'Batch not found.' })
    }

    const batchStudents = await getStudentsForBatch(batchId)
    const studentList = batchStudents.map((student) => {
      const completion = getStudentCompletion(uploads, student._id)
      return {
        id: student._id,
        full_name: student.full_name,
        roll_number: student.roll_number,
        image: student.image,
        completion_pct: completion.completion_pct,
        status: completion.status,
        categories_done: completion.categories_done,
        categories_total: completion.categories_total,
      }
    })

    const filtered = studentList.filter((student) => {
      if (filter === 'uploaded') return student.completion_pct === 100
      if (filter === 'pending') return student.completion_pct < 100
      return true
    })

    res.json({
      batch: {
        id: batchId,
        name: batch?.name ?? batchName,
        school_id: batch?.school_id ?? schoolId,
      },
      batch_upload: await getBatchUpload(batchId),
      students: filtered,
    })
  })

  router.get('/students/:studentId', async (req, res) => {
    const { studentId } = req.params

    const localStudent = await getStudentById(studentId)
    if (localStudent) {
      if (!(await teacherOwnsStudent(req.teacher.user_id, studentId, {
        batchIds: req.batchIds,
        schoolIds: req.schoolIds,
      }))) {
        return res.status(403).json({ forbidden: true })
      }

      const batch = await getBatchById(localStudent.batch_id)
      const school = await getSchoolById(batch.school_id)
      const uploads = await getUploadsForStudent(studentId)
      const completion = getStudentCompletion(uploads, studentId)

      return res.json({
        student: {
          id: localStudent._id,
          full_name: localStudent.full_name,
          roll_number: localStudent.roll_number,
          image: localStudent.image,
          completion_pct: completion.completion_pct,
          categories_done: completion.categories_done,
          categories_total: completion.categories_total,
          status: completion.status,
        },
        batch: { id: batch._id, name: batch.name },
        school: { id: school._id, name: school.name },
        categories: completion.categories.map((row) => ({
          category: row.category,
          complete: row.complete,
          drafts: row.drafts,
          submitted: row.submitted,
        })),
        uploads,
      })
    }

    const uploads = await getUploadsForStudent(studentId)
    const completion = getStudentCompletion(uploads, studentId)

    const batchId = req.query.batch_id
    const batch = batchId ? await getBatchById(batchId) : null
    const school = batch ? await getSchoolById(batch.school_id) : null

    res.json({
      student: {
        id: studentId,
        full_name: studentId,
        roll_number: '',
        image: null,
        completion_pct: completion.completion_pct,
        categories_done: completion.categories_done,
        categories_total: completion.categories_total,
        status: completion.status,
      },
      batch: batch ? { id: batch._id, name: batch.name } : { id: batchId ?? '', name: '' },
      school: school ? { id: school._id, name: school.name } : { id: '', name: '' },
      categories: completion.categories.map((row) => ({
        category: row.category,
        complete: row.complete,
        drafts: row.drafts,
        submitted: row.submitted,
      })),
      uploads,
    })
  })

  return router
}
