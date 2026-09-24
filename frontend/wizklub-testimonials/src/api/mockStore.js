import { assetUrl } from '../lib/assets.js'
import { UPLOAD_STATUS } from './constants.js'
import { buildHealthSnapshot } from './mockHealth.js'

const conductDraftResponses = new Map()

function conductDraftKey(batchId, sessionId, questionId, studentId) {
  return `${batchId}:${sessionId}:${questionId}:${studentId}`
}

const teachers = [
  {
    id: 'demo.teacher',
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
  { teacher_id: 'demo.teacher', school_id: 'school-1' },
  { teacher_id: 'demo.teacher', school_id: 'school-2' },
]

const batches = [
  { id: 'batch-1', school_id: 'school-1', teacher_id: 'demo.teacher', name: 'Grade 5 · Batch A', grade: '5', section: 'A' },
  { id: 'batch-2', school_id: 'school-1', teacher_id: 'demo.teacher', name: 'Grade 6 · Batch B', grade: '6', section: 'B' },
  { id: 'batch-3', school_id: 'school-2', teacher_id: 'demo.teacher', name: 'Grade 7 · Batch A', grade: '7', section: 'A' },
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
    teacher_id: 'demo.teacher',
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
let feedbackSeq = 0
let feedbacks = []
let uploadCounter = uploads.length

let batchUploads = {
  'batch-1': {
    id: 'batch-photo-1',
    batch_id: 'batch-1',
    teacher_id: 'demo.teacher',
    media_type: 'photo',
    blob_url: assetUrl('assets/school-campus.png'),
    blob_key: 'batch/photo/batch-1/seed',
    file_size_bytes: 1024 * 256,
    upload_source: 'web',
    status: UPLOAD_STATUS.SUBMITTED,
    created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    submitted_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
}

/** Static mock Question Conduct State fixtures (API-shaped only; no domain rules). */
const MOCK_CONDUCT_STUDENTS = [
  {
    student_id: 'rahul',
    username: 'rahul',
    name: 'Rahul',
    has_sr_card: true,
    sr_code_id: 40,
    response: {
      selected_answer: null,
      verified: false,
      submitted: false,
      score: null,
      timestamp: null,
    },
  },
  {
    student_id: 'priya',
    username: 'priya',
    name: 'Priya',
    has_sr_card: true,
    sr_code_id: 41,
    response: {
      selected_answer: null,
      verified: false,
      submitted: false,
      score: null,
      timestamp: null,
    },
  },
  {
    student_id: 'amit',
    username: 'amit',
    name: 'Amit',
    has_sr_card: false,
    sr_code_id: null,
    response: {
      selected_answer: null,
      verified: false,
      submitted: false,
      score: null,
      timestamp: null,
    },
  },
]

const MOCK_CONDUCT_SUMMARY = {
  responses_received: 0,
  responses_expected: 3,
  verified_students: 0,
  missing_sr_card_count: 1,
  completed: false,
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

function getBatchUpload(batchId) {
  return batchUploads[batchId] ?? null
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

let healthSnapshot = null

/** Demo health snapshot built from the mock roster (usernames = mock student ids). */
function getHealthSnapshot() {
  if (!healthSnapshot) {
    healthSnapshot = buildHealthSnapshot({
      teacher: { username: 'demo.teacher', name: 'Demo Teacher' },
      batches: batches.map((batch) => ({
        batch_id: batch.id,
        batch_name: batch.name,
        grade: batch.grade,
        school_id: batch.school_id,
        school_name: getSchoolById(batch.school_id)?.name ?? '',
        students: getStudentsForBatch(batch.id).map((st) => ({ username: st.id, name: st.full_name })),
      })),
    })
  }
  return healthSnapshot
}

function healthRun(snapshot) {
  const { _id, is_latest: _latest, ...rest } = snapshot.run
  return { id: _id, ...rest }
}

export const mockStore = {
  getBatchHealth(batchId) {
    const teacher = getTeacher()
    if (!teacher) return null
    if (!teacherOwnsBatch(teacher.id, batchId)) return { forbidden: true }
    const snap = getHealthSnapshot()
    return {
      run: healthRun(snap),
      batch: snap.batches.find((b) => b.batch_id === batchId) ?? null,
      students: snap.students.filter((s) => s.batch_id === batchId),
    }
  },

  getStudentHealth(batchId, username) {
    const teacher = getTeacher()
    if (!teacher) return null
    if (!teacherOwnsBatch(teacher.id, batchId)) return { forbidden: true }
    const snap = getHealthSnapshot()
    return {
      run: healthRun(snap),
      batch: snap.batches.find((b) => b.batch_id === batchId) ?? null,
      student: snap.students.find((s) => s.batch_id === batchId && s.username === username) ?? null,
      detail: snap.details.find((d) => d.batch_id === batchId && d.username === username) ?? null,
    }
  },

  getHealthAttention() {
    const teacher = getTeacher()
    if (!teacher) return null
    const snap = getHealthSnapshot()
    const schoolIds = getAssignedSchoolIds(teacher.id)
    const rows = snap.batches
      .filter((b) => schoolIds.includes(b.school_id))
      .map((b) => {
        const roster = snap.students.filter((s) => s.batch_id === b.batch_id)
        const held = new Set(roster.flatMap((s) => s.outcomes.assessments.map((a) => a.session_id)))
        return {
          batch_id: b.batch_id,
          batch_name: b.batch_name,
          school_id: b.school_id,
          school_name: b.school_name,
          overall_band: b.overall_band,
          students: roster.length,
          red: roster.filter((s) => s.overall_band === 'R').length,
          not_started: roster.filter((s) => s.participation.not_started).length,
          pending_assessment: roster.filter((s) => {
            const taken = new Set(s.outcomes.assessments.map((a) => a.session_id))
            return [...held].some((id) => !taken.has(id))
          }).length,
        }
      })
      .sort((a, b) => b.red - a.red || b.not_started - a.not_started)
    return { run: healthRun(snap), batches: rows }
  },

  getSessionTeacherId: () => sessionTeacherId,

  getSessionSummary(batchId) {
    const byBatch = {
      g8a: { total: 42, done: 28, missed: 10, cancelled: 4 },
      g8b: { total: 38, done: 26, missed: 8, cancelled: 4 },
      g7a: { total: 36, done: 24, missed: 9, cancelled: 3 },
      g9a: { total: 45, done: 31, missed: 11, cancelled: 3 },
    }
    const sessions = byBatch[batchId] || byBatch.g8a
    return { ...sessions, period_type: 'MONTHLY' }
  },

  getLmsTime() {
    const year = new Date().getFullYear()
    return {
      configured: true,
      year,
      hours: 48,
      minutes: 2880,
      display: '48h',
      label: `Active in ${year}`,
      month_points: [
        { label: 'Jul 1–7', minutes: 120 },
        { label: 'Jul 8–14', minutes: 95 },
        { label: 'Jul 15–21', minutes: 140 },
        { label: 'Jul 22–28', minutes: 180 },
        { label: 'Jul 29–31', minutes: 60 },
      ],
      chart_hint: 'Each point is a week in the current month',
    }
  },

  getFeedbackSummary(batchId) {
    const byBatch = {
      g8a: {
        overall: 4.8,
        forms: 134,
        grades: [
          { grade: 'Grade 8', value: 4.9, tag: 'Highest', tone: 'high' },
          { grade: 'Grade 7', value: 4.7, tag: null, tone: 'mid' },
          { grade: 'Grade 9', value: 4.2, tag: 'Lowest', tone: 'low' },
        ],
      },
      g8b: {
        overall: 4.6,
        forms: 98,
        grades: [
          { grade: 'Grade 8', value: 4.7, tag: 'Highest', tone: 'high' },
          { grade: 'Grade 7', value: 4.5, tag: null, tone: 'mid' },
          { grade: 'Grade 9', value: 4.1, tag: 'Lowest', tone: 'low' },
        ],
      },
    }
    return byBatch[batchId] || byBatch.g8a
  },

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
      return submittedCategories.size < CATEGORIES_TOTAL
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
        // Same meaning as the real API: students with at least one upload.
        testimonials_uploaded: new Set(
          uploads
            .filter((upload) => assignedStudents.some((s) => s.id === upload.student_id))
            .map((upload) => upload.student_id),
        ).size,
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
      const completionPct = Math.round((categoriesDone / CATEGORIES_TOTAL) * 100)
      return {
        id: student.id,
        full_name: student.full_name,
        roll_number: student.roll_number,
        image: student.image,
        completion_pct: completionPct,
        status: completionPct === 100 ? 'uploaded' : 'pending',
        categories_done: categoriesDone,
        categories_total: CATEGORIES_TOTAL,
      }
    })

    const filtered = batchStudents.filter((student) => {
      if (filter === 'uploaded') return student.completion_pct === 100
      if (filter === 'pending') return student.completion_pct < 100
      return true
    })

    return {
      batch: { id: batch.id, name: batch.name, school_id: batch.school_id },
      batch_upload: getBatchUpload(batchId),
      students: filtered,
    }
  },

  getBatchAssessments(batchId) {
    const teacher = getTeacher()
    if (!teacher) return null

    const batch = getBatchById(batchId)
    if (!batch) return null
    if (!getAssignedSchoolIds(teacher.id).includes(batch.school_id)) return { forbidden: true }

    return {
      batch_id: batchId,
      sessions: [
        {
          session_id: 'assessment-1',
          title: '1. Assessment - I',
          type: 'assessment',
          is_scannable: true,
          status: 'NOT_STARTED',
          scheduled_date: null,
          duration: 45,
        },
        {
          session_id: 'assessment-2',
          title: '2. Assessment - II',
          type: 'assessment',
          is_scannable: true,
          status: 'COMPLETED',
          scheduled_date: new Date(Date.now() - 7 * 86400000).toISOString(),
          duration: 45,
        },
        {
          session_id: 'assessment-3',
          title: '3. Assessment - III',
          type: 'assessment',
          is_scannable: true,
          status: 'NOT_STARTED',
          scheduled_date: new Date(Date.now() + 14 * 86400000).toISOString(),
          duration: 45,
        },
      ],
    }
  },

  getAssessmentConduct(batchId, sessionId) {
    const teacher = getTeacher()
    if (!teacher) return null

    const batch = getBatchById(batchId)
    if (!batch) return null
    if (!getAssignedSchoolIds(teacher.id).includes(batch.school_id)) return { forbidden: true }

    const assessments = this.getBatchAssessments(batchId)
    const session = (assessments?.sessions || []).find((item) => item.session_id === sessionId)
    if (!session) return null

    return {
      batch: {
        id: batchId,
        name: batch.name || batchId,
      },
      assessment: {
        session_id: sessionId,
        title: session.title,
        duration: session.duration ?? 45,
        status: session.status || 'NOT_STARTED',
        total_questions: 3,
      },
      current_question_index: 0,
      questions: [
        {
          question_id: 'level-1',
          sequence: 1,
          question: 'Which shape has three sides?',
          options: [
            { id: 'A', text: 'Square' },
            { id: 'B', text: 'Triangle' },
            { id: 'C', text: 'Circle' },
            { id: 'D', text: 'Rectangle' },
          ],
          correct_answer: 'B',
          explanation: 'A triangle has three sides.',
          marks: 1,
        },
        {
          question_id: 'level-2',
          sequence: 2,
          question: 'What is 7 + 5?',
          options: [
            { id: 'A', text: '10' },
            { id: 'B', text: '11' },
            { id: 'C', text: '12' },
            { id: 'D', text: '13' },
          ],
          correct_answer: 'C',
          explanation: '7 + 5 = 12.',
          marks: 1,
        },
        {
          question_id: 'level-3',
          sequence: 3,
          question: 'Which planet is known as the Red Planet?',
          options: [
            { id: 'A', text: 'Venus' },
            { id: 'B', text: 'Mars' },
            { id: 'C', text: 'Jupiter' },
            { id: 'D', text: 'Mercury' },
          ],
          correct_answer: 'B',
          explanation: 'Mars appears reddish due to iron oxide.',
          marks: 1,
        },
      ],
      students: MOCK_CONDUCT_STUDENTS.map((student) => ({
        ...student,
        response: { ...student.response },
      })),
      summary: { ...MOCK_CONDUCT_SUMMARY },
    }
  },

  getQuestionResponses(batchId, sessionId, questionId) {
    const teacher = getTeacher()
    if (!teacher) return null
    const batch = getBatchById(batchId)
    if (!batch) return null
    if (!getAssignedSchoolIds(teacher.id).includes(batch.school_id)) return { forbidden: true }

    const students = MOCK_CONDUCT_STUDENTS.map((student) => {
      const studentId = student.student_id || student.username
      const draft = conductDraftResponses.get(
        conductDraftKey(batchId, sessionId, questionId, studentId),
      )
      return {
        ...student,
        response: draft
          ? {
              selected_answer: draft.selected_answer,
              verified: true,
              submitted: true,
              score: null,
              timestamp: draft.updated_at,
            }
          : { ...student.response },
      }
    })

    const responsesReceived = students.filter(
      (student) => student.response?.selected_answer != null && student.response.selected_answer !== '',
    ).length

    return {
      question_id: questionId,
      students,
      summary: {
        ...MOCK_CONDUCT_SUMMARY,
        responses_received: responsesReceived,
      },
    }
  },

  saveQuestionResponses(batchId, sessionId, questionId, responses) {
    const teacher = getTeacher()
    if (!teacher) return { ok: false, error: 'Not authenticated' }
    const batch = getBatchById(batchId)
    if (!batch) return { ok: false, error: 'Batch not found' }
    if (!getAssignedSchoolIds(teacher.id).includes(batch.school_id)) return { forbidden: true }

    const now = new Date().toISOString()
    let saved = 0
    for (const row of responses || []) {
      const studentId = row?.student_id
      const selectedAnswer = row?.selected_answer
      if (!studentId || !selectedAnswer) continue
      conductDraftResponses.set(conductDraftKey(batchId, sessionId, questionId, studentId), {
        student_id: studentId,
        question_id: questionId,
        selected_answer: selectedAnswer,
        updated_at: now,
      })
      saved += 1
    }
    return { ok: true, data: { question_id: questionId, saved } }
  },

  deleteQuestionResponse(batchId, sessionId, questionId, studentId) {
    conductDraftResponses.delete(conductDraftKey(batchId, sessionId, questionId, studentId))
    return { ok: true }
  },

  submitAssessment(batchId, sessionId, body) {
    const teacher = getTeacher()
    if (!teacher) return { ok: false, error: 'Not authenticated' }
    const batch = getBatchById(batchId)
    if (!batch) return { ok: false, error: 'Batch not found' }
    if (!getAssignedSchoolIds(teacher.id).includes(batch.school_id)) return { forbidden: true }

    const responses = Array.isArray(body?.responses) ? body.responses : []
    const byStudent = new Map()
    for (const row of responses) {
      const studentId = row?.student_id
      if (!studentId) continue
      if (!byStudent.has(studentId)) byStudent.set(studentId, [])
      byStudent.get(studentId).push(row)
    }

    const students = [...byStudent.keys()].map((studentId) => ({
      student_id: studentId,
      status: 'COMPLETED',
      score_total: byStudent.get(studentId).length,
      score_percentage: 100,
      points_awarded: 10,
      failure_stage: null,
    }))

    return {
      ok: true,
      data: {
        batch_id: batchId,
        session_id: sessionId,
        submitted_count: students.length,
        skipped_count: 0,
        failed_count: 0,
        students,
      },
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
    const completionPct = Math.round((categoriesDone / CATEGORIES_TOTAL) * 100)

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
        categories_total: CATEGORIES_TOTAL,
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
      blob_key: `batch/photo/${batchId}/${Date.now()}`,
      file_size_bytes: file.size,
      upload_source: 'web',
      status: UPLOAD_STATUS.SUBMITTED,
      created_at: submittedAt,
      submitted_at: submittedAt,
    }

    batchUploads = { ...batchUploads, [batchId]: record }
    return { ok: true, status: 201, upload: record }
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

  listFeedback({ school_id, batch_id, status, page = 1, limit = 20 } = {}) {
    const teacher = getTeacher()
    if (!teacher) return { ok: false, status: 401, error: 'Not authenticated.' }

    let items = feedbacks.filter((row) => row.teacher_id === teacher.id)
    if (school_id) items = items.filter((row) => row.school_id === school_id)
    if (batch_id) items = items.filter((row) => row.batch_id === batch_id)
    if (status) items = items.filter((row) => row.status === status)

    items = [...items].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    const total = items.length
    const safePage = Math.max(1, Number(page) || 1)
    const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20))
    const start = (safePage - 1) * safeLimit
    const pageItems = items.slice(start, start + safeLimit)

    return {
      ok: true,
      items: pageItems,
      page: safePage,
      limit: safeLimit,
      total,
      total_pages: Math.ceil(total / safeLimit) || 0,
    }
  },

  getFeedback(feedbackId) {
    const teacher = getTeacher()
    if (!teacher) return { ok: false, status: 401, error: 'Not authenticated.' }
    const row = feedbacks.find(
      (item) => item.feedback_id === feedbackId && item.teacher_id === teacher.id,
    )
    if (!row) return { ok: false, status: 404, error: 'Feedback not found.' }
    return { ok: true, feedback: row }
  },

  createFeedback({ school_id, batch_id, category, summary, priority, files = [] }) {
    const teacher = getTeacher()
    if (!teacher) return { ok: false, status: 401, error: 'Not authenticated.' }

    const trimmed = String(summary ?? '').trim()
    if (!trimmed) return { ok: false, status: 400, error: 'Summary is required.' }

    const school = school_id ? getSchoolById(school_id) : null
    const batch = batch_id ? getBatchById(batch_id) : null
    feedbackSeq += 1
    const year = new Date().getFullYear()
    const feedbackId = `FB-${year}-${String(feedbackSeq).padStart(4, '0')}`
    const now = new Date().toISOString()

    const attachments = files.map((file, index) => ({
      url: URL.createObjectURL(file),
      type: file.type.startsWith('video/') ? 'video' : 'image',
      filename: file.name || `attachment-${index + 1}`,
      uploaded_at: now,
    }))

    const row = {
      feedback_id: feedbackId,
      school_id: school_id || '',
      school_name: school?.name || school_id || '',
      batch_id: batch_id || '',
      batch_name: batch?.name || batch_id || '',
      teacher_id: teacher.id,
      teacher_name: teacher.full_name,
      category: category || 'other',
      summary: trimmed,
      attachments,
      status: 'open',
      priority: priority || null,
      created_at: now,
      updated_at: now,
      resolved_at: null,
      resolution_note: '',
    }

    feedbacks = [row, ...feedbacks]
    return { ok: true, status: 201, feedback: row }
  },

  updateFeedback(feedbackId, { status, resolution_note, priority } = {}) {
    const teacher = getTeacher()
    if (!teacher) return { ok: false, status: 401, error: 'Not authenticated.' }

    const index = feedbacks.findIndex(
      (item) => item.feedback_id === feedbackId && item.teacher_id === teacher.id,
    )
    if (index < 0) return { ok: false, status: 404, error: 'Feedback not found.' }

    const now = new Date().toISOString()
    const current = feedbacks[index]
    const next = {
      ...current,
      updated_at: now,
      status: status || current.status,
      resolution_note:
        resolution_note !== undefined ? String(resolution_note) : current.resolution_note,
      priority: priority !== undefined ? priority : current.priority,
      resolved_at: status === 'resolved' ? now : status ? null : current.resolved_at,
    }
    feedbacks = feedbacks.map((item, i) => (i === index ? next : item))
    return { ok: true, feedback: next }
  },
}
