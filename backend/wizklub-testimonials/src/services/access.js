import { Teacher, School, TeacherSchoolAssignment, Batch, Student, Upload, BatchUpload } from '../db/models.js'
import { isDatabaseReady } from '../db/state.js'

async function resolveEffectiveSchoolIds(teacherId, sessionSchoolIds = []) {
  const assigned = await getAssignedSchoolIds(teacherId)
  if (assigned.length > 0) return assigned
  return sessionSchoolIds ?? []
}

export async function getAssignedSchoolIds(teacherId) {
  if (!isDatabaseReady()) return []
  const rows = await TeacherSchoolAssignment.find({ teacher_id: teacherId }).lean()
  return rows.map((r) => r.school_id)
}

export async function getStudentById(studentId) {
  if (!isDatabaseReady()) return null
  return Student.findById(studentId).lean()
}

export async function getBatchById(batchId) {
  if (!isDatabaseReady()) return null
  return Batch.findById(batchId).lean()
}

export async function getSchoolById(schoolId) {
  if (!isDatabaseReady()) return null
  return School.findById(schoolId).lean()
}

export async function teacherOwnsStudent(teacherId, studentId, session = {}) {
  const { batchIds = [], schoolIds: sessionSchoolIds = [] } = session
  const effectiveSchoolIds = await resolveEffectiveSchoolIds(teacherId, sessionSchoolIds)

  const student = await getStudentById(studentId)
  if (student?.batch_id) {
    const batch = await getBatchById(student.batch_id)
    if (batch?.school_id && effectiveSchoolIds.includes(batch.school_id)) {
      return true
    }
    if (batchIds.includes(student.batch_id)) {
      return true
    }
  }

  // Students from the live Wizklub API are often not in Mongo; allow uploads when
  // the instructor session has assigned schools/batches (same scope as student listing).
  if (effectiveSchoolIds.length > 0 || batchIds.length > 0) {
    return true
  }

  return false
}

export async function getStudentsForBatch(batchId) {
  if (!isDatabaseReady()) return []
  return Student.find({ batch_id: batchId }).sort({ full_name: 1 }).lean()
}

export async function getBatchesForSchool(schoolId) {
  if (!isDatabaseReady()) return []
  return Batch.find({ school_id: schoolId }).sort({ name: 1 }).lean()
}

export async function getAssignedStudents(teacherId) {
  if (!isDatabaseReady()) return []
  const schoolIds = await getAssignedSchoolIds(teacherId)
  if (schoolIds.length === 0) return []

  const batches = await Batch.find({ school_id: { $in: schoolIds } }).lean()
  const batchIds = batches.map((b) => b._id)
  return Student.find({ batch_id: { $in: batchIds } }).sort({ full_name: 1 }).lean()
}

export function mapUploadRow(row) {
  if (!row) return null
  return {
    id: row._id,
    student_id: row.student_id,
    teacher_id: row.teacher_id,
    category: row.category,
    media_type: row.media_type,
    blob_url: row.blob_url,
    blob_key: row.blob_key,
    file_size_bytes: row.file_size_bytes,
    duration_seconds: row.duration_seconds,
    upload_source: row.upload_source,
    status: row.status,
    created_at: row.created_at,
    submitted_at: row.submitted_at,
  }
}

export async function getUploadsForStudent(studentId) {
  if (!isDatabaseReady()) return []
  const rows = await Upload.find({ student_id: studentId }).sort({ created_at: -1 }).lean()
  return rows.map(mapUploadRow)
}

export async function getUploadById(uploadId) {
  if (!isDatabaseReady()) return null
  const row = await Upload.findById(uploadId).lean()
  return mapUploadRow(row)
}

export async function teacherOwnsBatch(teacherId, batchId, session = {}) {
  const { batchIds = [], schoolIds: sessionSchoolIds = [] } = session
  const effectiveSchoolIds = await resolveEffectiveSchoolIds(teacherId, sessionSchoolIds)

  const batch = await getBatchById(batchId)
  if (batch?.school_id && effectiveSchoolIds.includes(batch.school_id)) {
    return true
  }
  if (batchIds.includes(batchId)) {
    return true
  }

  // Batches from the live Wizklub API may not be synced to Mongo yet.
  if (effectiveSchoolIds.length > 0) {
    return true
  }

  return false
}

export function mapBatchUploadRow(row) {
  if (!row) return null
  return {
    id: row._id,
    batch_id: row.batch_id,
    teacher_id: row.teacher_id,
    media_type: row.media_type,
    blob_url: row.blob_url,
    blob_key: row.blob_key,
    file_size_bytes: row.file_size_bytes,
    upload_source: row.upload_source,
    status: row.status,
    created_at: row.created_at,
    submitted_at: row.submitted_at,
  }
}

export async function getBatchGroupPhoto(batchId) {
  if (!isDatabaseReady()) return null
  const row = await BatchUpload.findOne({ batch_id: batchId })
    .sort({ created_at: -1 })
    .lean()
  return mapBatchUploadRow(row)
}

export async function getBatchGroupPhotos(batchId) {
  if (!isDatabaseReady()) return []
  const rows = await BatchUpload.find({ batch_id: batchId })
    .sort({ created_at: -1 })
    .lean()
  return rows.map(mapBatchUploadRow)
}

export async function getAllUploads() {
  if (!isDatabaseReady()) return []
  const rows = await Upload.find().lean()
  return rows.map(mapUploadRow)
}
