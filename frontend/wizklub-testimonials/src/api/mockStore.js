import { UPLOAD_STATUS } from './constants'
import { assetUrl } from '../lib/assets.js'

const teachers = [
  {
    id: 'teacher-1',
    user_id: 'demo.teacher',
    password: 'demo',
    full_name: 'Demo Teacher',
  },
]

const schools = [
  { id: 'school-1', name: 'Sri Chaitanya — Mylapore', branch_code: 'SC-MYL' },
  { id: 'school-2', name: 'Delhi Public School — Adyar', branch_code: 'DPS-ADY' },
]

const teacherSchoolAssignments = [
  { teacher_id: 'teacher-1', school_id: 'school-1' },
  { teacher_id: 'teacher-1', school_id: 'school-2' },
]

const batches = [
  { id: 'batch-1', school_id: 'school-1', name: 'Grade 5 · Batch A', grade: '5', section: 'A' },
  { id: 'batch-2', school_id: 'school-1', name: 'Grade 6 · Batch B', grade: '6', section: 'B' },
  { id: 'batch-3', school_id: 'school-2', name: 'Grade 7 · Batch A', grade: '7', section: 'A' },
]

const studentNames = [
  'Arjun Mehta', 'Ananya Iyer', 'Rohan Das', 'Kavya Nair', 'Vihaan Patel',
  'Isha Reddy', 'Aditya Kumar', 'Meera Shah', 'Kabir Singh', 'Diya Menon',
  'Neha Gupta', 'Rahul Verma', 'Sana Khan', 'Aarav Joshi', 'Pooja Rao',
  'Karan Malhotra', 'Lakshmi Pillai', 'Dev Sharma', 'Nisha Agarwal', 'Yash Desai',
]

const students = studentNames.map((full_name, index) => {
  const batchIndex = index < 8 ? 0 : index < 14 ? 1 : 2
  return {
    id: `student-${index + 1}`,
    batch_id: batches[batchIndex].id,
    full_name,
    roll_number: `ST${8800 + index + 1}`,
    image: assetUrl(`assets/student-${(index % 5) + 1}.png`),
  }
})

const categoryPatterns = [
  ['ptm', 'principal_review', 'parent_review', 'teacher_review', 'student_review'],
  ['ptm', 'principal_review', 'parent_review', 'teacher_review'],
  ['ptm', 'principal_review', 'parent_review'],
  ['ptm', 'principal_review'],
  ['ptm'],
  [],
]

let uploads = students.flatMap((student, index) => {
  const categories = categoryPatterns[index % categoryPatterns.length]
  return categories.map((category, categoryIndex) => ({
    id: `upload-${student.id}-${category}`,
    student_id: student.id,
    teacher_id: 'teacher-1',
    category,
    media_type: categoryIndex % 2 === 0 ? 'video' : 'photo',
    blob_url: assetUrl(`assets/media-${category === 'ptm' ? 'ptm' : category === 'principal_review' ? 'principal' : category === 'parent_review' ? 'parent' : 'video'}.png`),
    blob_key: `${student.id}/${category}`,
    file_size_bytes: 1024 * 512,
    duration_seconds: categoryIndex % 2 === 0 ? 90 : null,
    upload_source: 'web',
    status: UPLOAD_STATUS.SUBMITTED,
    created_at: new Date(Date.now() - index * 86400000 - categoryIndex * 3600000).toISOString(),
    submitted_at: new Date(Date.now() - index * 86400000 - categoryIndex * 3600000).toISOString(),
  }))
})

let sessionTeacherId = null
let uploadCounter = uploads.length

let batchGroupPhotos = {
  'batch-1': {
    id: 'batch-photo-1',
    batch_id: 'batch-1',
    teacher_id: 'teacher-1',
    media_type: 'photo',
    blob_url: assetUrl('assets/school-campus.png'),
    blob_key: 'batch-1/group-photo/seed',
    file_size_bytes: 1024 * 256,
    upload_source: 'web',
    status: UPLOAD_STATUS.SUBMITTED,
    created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    submitted_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
}

function getTeacher() {
  return teachers.find((teacher) => teacher.id === sessionTeacherId) ?? null
}

function getAssignedSchoolIds(teacherId) {
  return teacherSchoolAssignments
    .filter((row) => row.teacher_id === teacherId)
    .map((row) => row.school_id)
}

function getSchoolById(schoolId) {
  return schools.find((school) => school.id === schoolId) ?? null
}

function getBatchById(batchId) {
  return batches.find((batch) => batch.id === batchId) ?? null
}

function getStudentById(studentId) {
  return students.find((student) => student.id === studentId) ?? null
}

function teacherOwnsBatch(teacherId, batchId) {
  const batch = getBatchById(batchId)
  if (!batch) return false
  return getAssignedSchoolIds(teacherId).includes(batch.school_id)
}

function getBatchGroupPhoto(batchId) {
  return batchGroupPhotos[batchId] ?? null
}

function teacherOwnsStudent(teacherId, studentId) {
  const student = getStudentById(studentId)
  if (!student) return false
  const batch = getBatchById(student.batch_id)
  if (!batch) return false
  return getAssignedSchoolIds(teacherId).includes(batch.school_id)
}

function getStudentsForBatch(batchId) {
  return students.filter((student) => student.batch_id === batchId)
}

function getBatchesForSchool(schoolId) {
  return batches.filter((batch) => batch.school_id === schoolId)
}

export const mockStore = {
  getSessionTeacherId: () => sessionTeacherId,

  login(user_id, password) {
    const teacher = teachers.find((row) => row.user_id === user_id && row.password === password)
    if (!teacher) return { ok: false, error: 'Invalid user ID or password.' }
    sessionTeacherId = teacher.id
    return { ok: true, teacher: { id: teacher.id, full_name: teacher.full_name, user_id: teacher.user_id } }
  },

  logout() {
    sessionTeacherId = null
  },

  getMe() {
    const teacher = getTeacher()
    if (!teacher) return null
    return { id: teacher.id, full_name: teacher.full_name, user_id: teacher.user_id }
  },

  getUploads() {
    return uploads
  },

  getDashboard() {
    const teacher = getTeacher()
    if (!teacher) return null

    const schoolIds = getAssignedSchoolIds(teacher.id)
    const assignedStudents = students.filter((student) => {
      const batch = getBatchById(student.batch_id)
      return batch && schoolIds.includes(batch.school_id)
    })

    const pendingStudents = assignedStudents.filter((student) => {
      const submittedCategories = new Set(
        uploads
          .filter(
            (upload) =>
              upload.student_id === student.id && upload.status === UPLOAD_STATUS.SUBMITTED,
          )
          .map((upload) => upload.category),
      )
      return submittedCategories.size < 5
    }).length

    const videosUploaded = uploads.filter(
      (upload) =>
        upload.media_type === 'video' &&
        upload.status === UPLOAD_STATUS.SUBMITTED &&
        assignedStudents.some((s) => s.id === upload.student_id),
    ).length

    return {
      teacher: { full_name: teacher.full_name },
      stats: {
        total_students: assignedStudents.length,
        videos_uploaded: videosUploaded,
        pending_students: pendingStudents,
      },
      schools: schoolIds.map((schoolId) => {
        const school = getSchoolById(schoolId)
        const schoolBatches = getBatchesForSchool(schoolId)
        const schoolStudents = assignedStudents.filter((student) =>
          schoolBatches.some((batch) => batch.id === student.batch_id),
        )
        return {
          id: school.id,
          name: school.name,
          batch_count: schoolBatches.length,
          student_count: schoolStudents.length,
        }
      }),
    }
  },

  getSchools() {
    const teacher = getTeacher()
    if (!teacher) return null
    return mockStore.getDashboard().schools
  },

  getBatches(schoolId) {
    const teacher = getTeacher()
    if (!teacher) return null
    if (!getAssignedSchoolIds(teacher.id).includes(schoolId)) return { forbidden: true }

    const school = getSchoolById(schoolId)
    if (!school) return null

    return {
      school: { id: school.id, name: school.name },
      batches: getBatchesForSchool(schoolId).map((batch) => {
        const batchStudents = getStudentsForBatch(batch.id)
        return {
          id: batch.id,
          name: batch.name,
          student_count: batchStudents.length,
          student_ids: batchStudents.map((student) => student.id),
        }
      }),
    }
  },

  getStudents(batchId, filter = 'all') {
    const teacher = getTeacher()
    if (!teacher) return null

    const batch = getBatchById(batchId)
    if (!batch) return null
    if (!getAssignedSchoolIds(teacher.id).includes(batch.school_id)) return { forbidden: true }

    const batchStudents = getStudentsForBatch(batchId).map((student) => {
      const categoriesDone = new Set(
        uploads
          .filter(
            (upload) =>
              upload.student_id === student.id && upload.status === UPLOAD_STATUS.SUBMITTED,
          )
          .map((upload) => upload.category),
      ).size
      const completionPct = Math.round((categoriesDone / 5) * 100)
      return {
        id: student.id,
        full_name: student.full_name,
        roll_number: student.roll_number,
        image: student.image,
        completion_pct: completionPct,
        status: completionPct === 100 ? 'uploaded' : 'pending',
        categories_done: categoriesDone,
        categories_total: 5,
      }
    })

    const filtered = batchStudents.filter((student) => {
      if (filter === 'uploaded') return student.completion_pct === 100
      if (filter === 'pending') return student.completion_pct < 100
      return true
    })

    return {
      batch: { id: batch.id, name: batch.name, school_id: batch.school_id },
      group_photo: getBatchGroupPhoto(batchId),
      students: filtered,
    }
  },

  getStudent(studentId) {
    const teacher = getTeacher()
    if (!teacher) return null
    if (!teacherOwnsStudent(teacher.id, studentId)) return { forbidden: true }

    const student = getStudentById(studentId)
    const batch = getBatchById(student.batch_id)
    const school = getSchoolById(batch.school_id)

    const categoriesDone = new Set(
      uploads
        .filter(
          (upload) => upload.student_id === studentId && upload.status === UPLOAD_STATUS.SUBMITTED,
        )
        .map((upload) => upload.category),
    ).size
    const completionPct = Math.round((categoriesDone / 5) * 100)

    const categoryUploads = {}
    for (const upload of uploads) {
      if (upload.student_id !== studentId || upload.status !== UPLOAD_STATUS.SUBMITTED) continue
      if (!categoryUploads[upload.category]) categoryUploads[upload.category] = []
      categoryUploads[upload.category].push(upload)
    }

    for (const category of Object.keys(categoryUploads)) {
      categoryUploads[category].sort(
        (a, b) => new Date(b.submitted_at ?? b.created_at) - new Date(a.submitted_at ?? a.created_at),
      )
    }

    return {
      student: {
        id: student.id,
        full_name: student.full_name,
        roll_number: student.roll_number,
        image: student.image,
        completion_pct: completionPct,
        categories_done: categoriesDone,
        categories_total: 5,
      },
      batch: { id: batch.id, name: batch.name },
      school: { id: school.id, name: school.name },
      categories: Object.entries(categoryUploads).map(([category, items]) => ({
        category,
        uploads: items,
      })),
      uploads: uploads.filter((upload) => upload.student_id === studentId),
    }
  },

  addUpload(studentId, category, file, previewUrl) {
    const teacher = getTeacher()
    if (!teacher) return { ok: false, status: 401, error: 'Not authenticated.' }
    if (!teacherOwnsStudent(teacher.id, studentId)) {
      return { ok: false, status: 403, error: 'You do not have access to this student.' }
    }

    uploadCounter += 1
    const isVideo = file.type.startsWith('video/')
    const record = {
      id: `upload-${uploadCounter}`,
      student_id: studentId,
      teacher_id: teacher.id,
      category,
      media_type: isVideo ? 'video' : 'photo',
      blob_url: previewUrl,
      blob_key: `${studentId}/${category}/${uploadCounter}`,
      file_size_bytes: file.size,
      duration_seconds: null,
      upload_source: 'web',
      status: UPLOAD_STATUS.DRAFT,
      created_at: new Date().toISOString(),
      submitted_at: null,
    }

    uploads = [...uploads, record]
    return { ok: true, status: 201, upload: record }
  },

  uploadBatchGroupPhoto(batchId, file, previewUrl) {
    const teacher = getTeacher()
    if (!teacher) return { ok: false, status: 401, error: 'Not authenticated.' }
    if (!teacherOwnsBatch(teacher.id, batchId)) {
      return { ok: false, status: 403, error: 'You do not have access to this batch.' }
    }

    const submittedAt = new Date().toISOString()
    const record = {
      id: `batch-photo-${batchId}-${Date.now()}`,
      batch_id: batchId,
      teacher_id: teacher.id,
      media_type: 'photo',
      blob_url: previewUrl,
      blob_key: `${batchId}/group-photo/${Date.now()}`,
      file_size_bytes: file.size,
      upload_source: 'web',
      status: UPLOAD_STATUS.SUBMITTED,
      created_at: submittedAt,
      submitted_at: submittedAt,
    }

    batchGroupPhotos = { ...batchGroupPhotos, [batchId]: record }
    return { ok: true, status: 201, group_photo: record }
  },

  deleteUpload(uploadId) {
    const teacher = getTeacher()
    if (!teacher) return { ok: false, status: 401, error: 'Not authenticated.' }

    const upload = uploads.find((row) => row.id === uploadId)
    if (!upload) return { ok: false, status: 404, error: 'Upload not found.' }
    if (upload.teacher_id !== teacher.id) {
      return { ok: false, status: 403, error: 'You do not have access to this upload.' }
    }
    if (upload.status === UPLOAD_STATUS.SUBMITTED) {
      return { ok: false, status: 403, error: 'Submitted media cannot be removed.' }
    }

    uploads = uploads.filter((row) => row.id !== uploadId)
    return { ok: true, status: 204 }
  },

  submitCategory(studentId, category) {
    const teacher = getTeacher()
    if (!teacher) return { ok: false, status: 401, error: 'Not authenticated.' }
    if (!teacherOwnsStudent(teacher.id, studentId)) {
      return { ok: false, status: 403, error: 'You do not have access to this student.' }
    }

    const draftIds = uploads
      .filter(
        (upload) =>
          upload.student_id === studentId &&
          upload.category === category &&
          upload.status === UPLOAD_STATUS.DRAFT,
      )
      .map((upload) => upload.id)

    if (draftIds.length === 0) {
      return { ok: false, status: 400, error: 'Add at least one photo or video before submitting.' }
    }

    const submittedAt = new Date().toISOString()
    uploads = uploads.map((upload) =>
      draftIds.includes(upload.id)
        ? { ...upload, status: UPLOAD_STATUS.SUBMITTED, submitted_at: submittedAt }
        : upload,
    )

    return {
      ok: true,
      status: 200,
      submitted_count: draftIds.length,
      submitted_at: submittedAt,
    }
  },

  restoreSession(teacherId) {
    if (teachers.some((teacher) => teacher.id === teacherId)) {
      sessionTeacherId = teacherId
      return mockStore.getMe()
    }
    return null
  },
}
