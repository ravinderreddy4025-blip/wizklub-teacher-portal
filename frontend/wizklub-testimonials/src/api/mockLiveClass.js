/**
 * Mock for the "Start class" feature (lab attendance by class code).
 *
 * Contract this stands in for:
 *   POST   /api/teacher/batches/:batchId/class            → start, mints the code
 *   GET    /api/teacher/batches/:batchId/class            → live session + roster
 *   PATCH  /api/teacher/batches/:batchId/class/students/:studentId  {status}
 *   POST   /api/teacher/batches/:batchId/class/students/:studentId/reset-pin
 *   POST   /api/teacher/batches/:batchId/class/end        → locks attendance
 *
 * Rules worth keeping when this becomes real:
 *  · The code is scoped to the school and dies when the class ends — it is never a password.
 *    Authorisation is the roster: a student may only join a batch they are enrolled in.
 *  · Attendance is PROVISIONAL until the teacher ends the class. That is the commit point,
 *    so a late joiner is not a dispute.
 *  · Codes that read badly on a whiteboard (1111, 1234, 0000 …) are never minted.
 */

import { mockStore } from './mockStore.js'

const CLASS_MINUTES = 40
const BAD_CODES = new Set([
  '0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999',
  '1234', '4321', '1212', '2121', '0123',
])

const sessions = new Map() // batch_id -> session (a real backend keys this by session id)

function liveCodesInSchool(schoolId, exceptBatchId) {
  return new Set(
    [...sessions.values()]
      .filter((s) => s.school_id === schoolId && s.status === 'live' && s.batch_id !== exceptBatchId)
      .map((s) => s.code),
  )
}

function mintCode(schoolId, batchId) {
  const taken = liveCodesInSchool(schoolId, batchId)
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const code = String(Math.floor(1000 + Math.random() * 9000))
    if (!BAD_CODES.has(code) && !taken.has(code)) return code
  }
  return '2468'
}

function gradeOf(batchName) {
  const match = /Grade\s+(\d+)/i.exec(batchName || '')
  return match ? Number(match[1]) : 6
}

// Per-batch setting, not a hard grade rule — pictures up to Grade 5, numbers from Grade 6,
// and a batch mid-switch can be flipped by the coordinator.
function pinStyleFor(batchName) {
  return gradeOf(batchName) <= 5 ? 'pictures' : 'numbers'
}

/*
 * Demo only: students "arrive" over the first couple of minutes so the roster fills in
 * while the teacher watches. Deterministic per student index so a reload looks the same.
 * Two students never arrive (genuinely absent) and one arrives late.
 */
function arrivalOffsetMs(index, total) {
  if (index >= total - 2) return Infinity // absent
  if (index === total - 3) return 115000 // the late one
  return 4000 + ((index * 6737) % 52000)
}

function project(session) {
  const now = Date.now()
  const roster = session.roster.map((student, index) => {
    if (session.status !== 'live' || student.status !== 'waiting') return student
    const due = arrivalOffsetMs(index, session.roster.length)
    if (now - session.started_at >= due) {
      return { ...student, status: 'joined', joined_at: session.started_at + due }
    }
    return student
  })
  session.roster = roster
  const joined = roster.filter((s) => s.status === 'joined').length
  return {
    ...session,
    roster,
    counts: {
      total: roster.length,
      joined,
      waiting: roster.filter((s) => s.status === 'waiting').length,
      absent: roster.filter((s) => s.status === 'absent').length,
    },
  }
}

export const mockLiveClass = {
  get(batchId) {
    const session = sessions.get(batchId)
    return session ? project(session) : null
  },

  start(batchId) {
    const data = mockStore.getStudents(batchId, 'all')
    if (!data || data.forbidden) return data ?? null

    const existing = sessions.get(batchId)
    if (existing && existing.status === 'live') return project(existing)

    const session = {
      id: `cls-${batchId}-${Date.now()}`,
      batch_id: batchId,
      batch_name: data.batch.name,
      school_id: data.batch.school_id,
      session_title: `Session ${8 + (gradeOf(data.batch.name) % 5)} · Today's lab`,
      code: mintCode(data.batch.school_id, batchId),
      pin_style: pinStyleFor(data.batch.name),
      status: 'live',
      started_at: Date.now(),
      ends_at: Date.now() + CLASS_MINUTES * 60000,
      roster: data.students.map((student) => ({
        id: student.id,
        full_name: student.full_name,
        roll_number: student.roll_number,
        image: student.image,
        status: 'waiting',
        joined_at: null,
        pin_locked: false,
      })),
    }
    sessions.set(batchId, session)
    return project(session)
  },

  mark(batchId, studentId, status) {
    const session = sessions.get(batchId)
    if (!session) return null
    session.roster = session.roster.map((student) =>
      student.id === studentId
        ? { ...student, status, joined_at: status === 'joined' ? student.joined_at ?? Date.now() : null }
        : student,
    )
    return project(session)
  },

  resetPin(batchId, studentId) {
    const session = sessions.get(batchId)
    if (!session) return null
    session.roster = session.roster.map((student) =>
      student.id === studentId ? { ...student, pin_locked: false, pin_reset_at: Date.now() } : student,
    )
    return project(session)
  },

  end(batchId) {
    const session = sessions.get(batchId)
    if (!session) return null
    // Ending the class is the commit point: anyone still waiting is recorded absent.
    session.roster = session.roster.map((student) =>
      student.status === 'waiting' ? { ...student, status: 'absent' } : student,
    )
    session.status = 'ended'
    session.ended_at = Date.now()
    session.code = null
    return project(session)
  },
}
