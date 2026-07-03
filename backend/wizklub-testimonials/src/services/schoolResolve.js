import { isDatabaseReady } from '../db/state.js'
import { getAssignedSchoolIds, getSchoolById } from './access.js'
import { fetchSchoolDetails, extractSchoolName } from './schoolSync.js'
import { fetchAllBatchesForSchool, filterByInstructorBatchIds } from './batchSync.js'

export async function resolveSchoolIds(teacherId, sessionSchoolIds = []) {
  const assigned = await getAssignedSchoolIds(teacherId)
  if (assigned.length > 0) return assigned
  return sessionSchoolIds ?? []
}

export async function resolveSchoolWithBatches(schoolId, { accessToken, instructorUsername, batchIds }) {
  let school = null
  if (isDatabaseReady()) {
    school = await getSchoolById(schoolId)
  }
  if (!school) {
    const payload = await fetchSchoolDetails(schoolId, accessToken)
    school = { _id: schoolId, name: extractSchoolName(payload, schoolId) }
  }

  const allBatches = await fetchAllBatchesForSchool(schoolId, instructorUsername, accessToken)
  const batches = filterByInstructorBatchIds(allBatches, batchIds).map((batch) => ({
    _id: batch.id,
    name: batch.name,
    student_count: batch.student_count ?? 0,
  }))

  return { school, batches }
}
