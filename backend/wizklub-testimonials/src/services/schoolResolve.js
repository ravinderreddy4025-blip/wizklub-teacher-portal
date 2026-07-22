import { getAssignedSchoolIds } from './access.js'
import { resolveSchoolDisplayName } from './schoolSync.js'
import { fetchAllBatchesForSchool, filterByInstructorBatchIds } from './batchSync.js'

export async function resolveSchoolIds(teacherId, sessionSchoolIds = []) {
  const assigned = await getAssignedSchoolIds(teacherId)
  if (assigned.length > 0) return assigned
  return sessionSchoolIds ?? []
}

export async function resolveSchoolWithBatches(schoolId, { accessToken, instructorUsername, batchIds }) {
  const instructorBatches = await fetchAllBatchesForSchool(schoolId, instructorUsername, accessToken)
  const batches = filterByInstructorBatchIds(instructorBatches, batchIds).map((batch) => ({
    _id: batch.id,
    name: batch.name,
    student_count: batch.student_count ?? 0,
  }))

  let nameBatchIds = batches.map((b) => b._id)
  if (!nameBatchIds.length) {
    const anyBatches = await fetchAllBatchesForSchool(schoolId, null, accessToken)
    nameBatchIds = anyBatches.slice(0, 3).map((b) => b.id)
  }

  const displayName = await resolveSchoolDisplayName(schoolId, {
    accessToken,
    batchIds: nameBatchIds,
  })

  return {
    school: { _id: schoolId, name: displayName || schoolId },
    batches,
  }
}
