import { isDatabaseReady } from '../db/state.js'
import { School } from '../db/models.js'
import { getAssignedSchoolIds, getSchoolById } from './access.js'
import { resolveSchoolDisplayName } from './schoolSync.js'
import { fetchAllBatchesForSchool, filterByInstructorBatchIds } from './batchSync.js'

export async function resolveSchoolIds(teacherId, sessionSchoolIds = []) {
  const assigned = await getAssignedSchoolIds(teacherId)
  if (assigned.length > 0) return assigned
  return sessionSchoolIds ?? []
}

export async function resolveSchoolWithBatches(schoolId, { accessToken, instructorUsername, batchIds }) {
  let instructorBatches = await fetchAllBatchesForSchool(schoolId, instructorUsername, accessToken)
  const batches = filterByInstructorBatchIds(instructorBatches, batchIds).map((batch) => ({
    _id: batch.id,
    name: batch.name,
    student_count: batch.student_count ?? 0,
  }))

  let school = null
  if (isDatabaseReady()) {
    school = await getSchoolById(schoolId)
  }

  let nameBatchIds = batches.map((b) => b._id)
  if (!nameBatchIds.length || !school?.name || school.name === schoolId) {
    if (!nameBatchIds.length) {
      const anyBatches = await fetchAllBatchesForSchool(schoolId, null, accessToken)
      nameBatchIds = anyBatches.slice(0, 3).map((b) => b.id)
    }

    const displayName = await resolveSchoolDisplayName(schoolId, {
      accessToken,
      batchIds: nameBatchIds,
      existingName: school?.name ?? null,
    })

    if (isDatabaseReady() && displayName && displayName !== school?.name) {
      await School.findByIdAndUpdate(schoolId, { name: displayName }, { upsert: true })
    }

    return {
      school: { _id: schoolId, name: displayName || schoolId },
      batches,
    }
  }

  return {
    school: { _id: schoolId, name: school.name },
    batches,
  }
}
