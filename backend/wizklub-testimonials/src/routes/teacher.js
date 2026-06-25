import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import {
  getAssignedSchoolIds,
  getBatchById,
  getBatchesForSchool,
  getSchoolById,
  getStudentById,
  getStudentsForBatch,
  getUploadsForStudent,
  getBatchGroupPhoto,
  teacherOwnsStudent,
  getAllUploads,
} from '../services/access.js'
import { fetchBatchesForSchool, extractBatches, filterByInstructorBatchIds } from '../services/batchSync.js'
import { syncSchoolsAndBatches } from '../services/schoolSync.js'
import { getSession } from '../services/sessionStore.js'
import { fetchStudentsForBatch, extractStudents } from '../services/studentSync.js'
import {
  getBatchCompletion,
  getStudentCompletion,
} from '../services/uploads.js'
import { HEALTH_TAG_LABELS, UPLOAD_STATUS } from '../utils/constants.js'

export function createTeacherRouter() {
  const router = Router()
  router.use(requireAuth)

  router.get('/dashboard', async (req, res) => {
    let schoolIds = await getAssignedSchoolIds(req.teacher._id)

    if (schoolIds.length === 0) {
      const session = getSession(req.accessToken)
      if (session?.schoolIds?.length) {
        try {
          await syncSchoolsAndBatches(req.teacher._id, session.schoolIds, session.batchIds ?? [], req.accessToken, session.userId)
          schoolIds = await getAssignedSchoolIds(req.teacher._id)
        } catch (err) {
          console.error('Lazy school sync failed:', err.message)
        }
      }
    }

    const uploads = await getAllUploads()

    const schools = []
    const allStudentIds = new Set()

    for (const schoolId of schoolIds) {
      const school = await getSchoolById(schoolId)
      if (!school) continue
      const schoolBatches = await getBatchesForSchool(schoolId)

      for (const batch of schoolBatches) {
        const apiPayload = await fetchStudentsForBatch(batch._id, req.accessToken)
        const students = extractStudents(apiPayload)
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
    const schoolIds = await getAssignedSchoolIds(req.teacher._id)
    const schools = []
    for (const schoolId of schoolIds) {
      const school = await getSchoolById(schoolId)
      if (!school) continue
      const schoolBatches = await getBatchesForSchool(schoolId)
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
    const schoolIds = await getAssignedSchoolIds(req.teacher._id)

    if (!schoolIds.includes(schoolId)) {
      return res.status(403).json({ forbidden: true })
    }

    const school = await getSchoolById(schoolId)
    if (!school) return res.status(404).json({ error: 'School not found.' })

    const session = getSession(req.accessToken)
    const instructorBatchIds = session?.batchIds ?? []
    const instructorUsername = session?.userId ?? req.teacher.user_id

    const apiPayload = await fetchBatchesForSchool(schoolId, instructorUsername, req.accessToken)
    const allBatches = extractBatches(apiPayload)
    const instructorBatches = filterByInstructorBatchIds(allBatches, instructorBatchIds)

    if (instructorBatches.length > 0) {
      const uploads = await getAllUploads()
      const batches = []

      for (const batch of instructorBatches) {
        const apiPayloadStudents = await fetchStudentsForBatch(batch.id, req.accessToken)
        const students = extractStudents(apiPayloadStudents)
        const studentIds = students.map((s) => s.id)
        const { completion_avg, health_tag } = getBatchCompletion(uploads, studentIds)

        batches.push({
          id: batch.id,
          name: batch.name,
          student_count: batch.student_count,
          student_ids: studentIds,
          completion_avg,
          health_tag,
          health_label: HEALTH_TAG_LABELS[health_tag],
        })
      }

      return res.json({
        school: { id: school._id, name: school.name },
        batches,
      })
    }

    const uploads = await getAllUploads()
    const dbBatches = await getBatchesForSchool(schoolId)
    const batches = []
    for (const batch of dbBatches) {
      const batchStudents = await getStudentsForBatch(batch._id)
      const studentIds = batchStudents.map((student) => student._id)
      const { completion_avg, health_tag } = getBatchCompletion(uploads, studentIds)

      batches.push({
        id: batch._id,
        name: batch.name,
        student_count: batchStudents.length,
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

  router.get('/batches/:batchId/students', async (req, res) => {
    const { batchId } = req.params
    const filter = req.query.filter ?? 'all'
    const batch = await getBatchById(batchId)

    if (!batch) {
      const apiPayload = await fetchStudentsForBatch(batchId, req.accessToken)
      const apiStudents = extractStudents(apiPayload)

      if (apiStudents.length > 0) {
        const uploads = await getAllUploads()
        const students = apiStudents.map((s) => {
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

        const filtered = students.filter((student) => {
          if (filter === 'uploaded') return student.completion_pct === 100
          if (filter === 'pending') return student.completion_pct < 100
          return true
        })

        return res.json({
          batch: { id: batchId, name: batchId, school_id: '' },
          group_photo: null,
          students: filtered,
        })
      }

      return res.status(404).json({ error: 'Batch not found.' })
    }

    const schoolIds = await getAssignedSchoolIds(req.teacher._id)
    if (!schoolIds.includes(batch.school_id)) {
      return res.status(403).json({ forbidden: true })
    }

    const apiPayload = await fetchStudentsForBatch(batchId, req.accessToken)
    const apiStudents = extractStudents(apiPayload)

    if (apiStudents.length > 0) {
      const uploads = await getAllUploads()
      const students = apiStudents.map((s) => {
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

      const filtered = students.filter((student) => {
        if (filter === 'uploaded') return student.completion_pct === 100
        if (filter === 'pending') return student.completion_pct < 100
        return true
      })

      return res.json({
        batch: { id: batch._id, name: batch.name, school_id: batch.school_id },
        group_photo: await getBatchGroupPhoto(batchId),
        students: filtered,
      })
    }

    const uploads = await getAllUploads()
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
      batch: { id: batch._id, name: batch.name, school_id: batch.school_id },
      group_photo: await getBatchGroupPhoto(batchId),
      students: filtered,
    })
  })

  router.get('/students/:studentId', async (req, res) => {
    const { studentId } = req.params

    const localStudent = await getStudentById(studentId)
    if (localStudent) {
      if (!(await teacherOwnsStudent(req.teacher._id, studentId))) {
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
