/** Read ``student_sr_codes.id`` from a conduct roster row (supports legacy field names). */
export function srCodeIdFromStudent(student) {
  if (!student) return null
  const raw =
    student.sr_code_id ??
    student.sr_code ??
    student.student_qr_code_id ??
    student.marker_id
  const id = Number(raw)
  if (!Number.isInteger(id) || id < 1) return null
  return id
}

export function buildStudentLookup(students = []) {
  const lookup = new Map()
  for (const student of students) {
    const studentQrCodeId = srCodeIdFromStudent(student)
    if (studentQrCodeId != null) {
      lookup.set(studentQrCodeId, student)
    }
  }
  return lookup
}

export function studentFromSrCodeId(studentQrCodeId, studentLookup) {
  if (studentQrCodeId == null || !studentLookup) return null
  const id = Number(studentQrCodeId)
  if (!Number.isInteger(id) || id < 1) return null
  return studentLookup.get(id) || null
}

/** Map decoded ``student_sr_codes.id`` → roster student + display fields. */
export function resolveStudentFromSrCodeId(studentQrCodeId, studentLookup) {
  const student = studentFromSrCodeId(studentQrCodeId, studentLookup)
  if (!student) return null
  const studentId = student.student_id || student.username
  if (!studentId) return null
  return {
    student,
    studentQrCodeId: Number(studentQrCodeId),
    studentId,
    displayName: student.name || student.username || studentId,
    username: student.username || studentId,
  }
}
