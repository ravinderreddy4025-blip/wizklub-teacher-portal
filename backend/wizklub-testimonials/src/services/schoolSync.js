import { WIZKLUB_URLS } from '../utils/wizklubAuth.js'
import { School, Batch, TeacherSchoolAssignment } from '../db/models.js'
import { isDatabaseReady } from '../db/state.js'
import { fetchAllBatchesForSchool } from './batchSync.js'
import { fetchSchoolNameFromBatch } from './studentSync.js'

export async function fetchSchoolDetails(schoolId, accessToken) {
  const url = `${WIZKLUB_URLS.schoolDetails}?school_id=${encodeURIComponent(schoolId)}`

  try {
    const headers = { accept: 'application/json' }
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`
    }

    const response = await fetch(url, { headers })

    if (!response.ok) {
      console.error(`[SchoolSync] ${schoolId} → status ${response.status}`)
      return null
    }

    return await response.json()
  } catch (err) {
    console.error(`[SchoolSync] ${schoolId} → fetch error:`, err.message)
    return null
  }
}

export function extractSchoolName(payload, schoolId) {
  if (!payload) return schoolId ?? null

  const candidate =
    payload?.data?.school?.name ||
    payload?.data?.school?.school_name ||
    payload?.data?.school_name ||
    payload?.data?.branch_name ||
    payload?.data?.name ||
    payload?.school_name ||
    payload?.branch_name ||
    payload?.name ||
    null

  if (typeof candidate === 'string' && candidate.trim()) {
    return candidate.trim()
  }

  return schoolId ?? null
}

/**
 * Resolve a display name for a school.
 * school-details is often unavailable for instructors, so fall back to
 * school_name on the first student in any known batch.
 */
export async function resolveSchoolDisplayName(schoolId, {
  accessToken,
  batchIds = [],
  existingName = null,
} = {}) {
  if (existingName && existingName !== schoolId) {
    return existingName
  }

  const details = await fetchSchoolDetails(schoolId, accessToken)
  const fromDetails = extractSchoolName(details, null)
  if (fromDetails && fromDetails !== schoolId) {
    return fromDetails
  }

  for (const batchId of batchIds) {
    const fromStudent = await fetchSchoolNameFromBatch(schoolId, batchId, accessToken)
    if (fromStudent) return fromStudent
  }

  return existingName || schoolId
}

export async function syncSchoolsAndBatches(teacherId, schoolIds, batchIds, accessToken, instructorUsername) {
  if (!isDatabaseReady()) return

  await TeacherSchoolAssignment.deleteMany({ teacher_id: teacherId })
  await Batch.deleteMany({ school_id: { $in: schoolIds }, teacher_id: teacherId })

  const schoolDetailResults = await Promise.allSettled(
    schoolIds.map((id) => fetchSchoolDetails(id, accessToken)),
  )

  for (let i = 0; i < schoolIds.length; i++) {
    const schoolId = schoolIds[i]
    const result = schoolDetailResults[i]
    const payload = result.status === 'fulfilled' ? result.value : null
    let name = extractSchoolName(payload, null)

    if (!name || name === schoolId) {
      // Will refine after batches are loaded below when possible.
      name = schoolId
    }

    await School.findByIdAndUpdate(schoolId, { name }, { upsert: true })
    await TeacherSchoolAssignment.findOneAndUpdate(
      { teacher_id: teacherId, school_id: schoolId },
      { teacher_id: teacherId, school_id: schoolId },
      { upsert: true },
    )
  }

  if (instructorUsername && accessToken) {
    const batchIdSet = new Set(batchIds ?? [])

    const batchResults = await Promise.allSettled(
      schoolIds.map((id) => fetchAllBatchesForSchool(id, instructorUsername, accessToken)),
    )

    for (let i = 0; i < schoolIds.length; i++) {
      const schoolId = schoolIds[i]
      const result = batchResults[i]
      const allBatches = result.status === 'fulfilled' ? (result.value ?? []) : []

      const instructorBatches = batchIdSet.size > 0
        ? allBatches.filter((b) => batchIdSet.has(b.id))
        : allBatches

      for (const batch of instructorBatches) {
        await Batch.findByIdAndUpdate(batch.id, {
          school_id: schoolId,
          teacher_id: teacherId,
          name: batch.name,
          grade: batch.grade,
          student_count: batch.student_count ?? 0,
        }, { upsert: true })
      }

      const existing = await School.findById(schoolId).lean()
      if (!existing?.name || existing.name === schoolId) {
        const lookupBatchIds = instructorBatches.map((b) => b.id)
        const displayName = await resolveSchoolDisplayName(schoolId, {
          accessToken,
          batchIds: lookupBatchIds,
          existingName: existing?.name,
        })
        if (displayName && displayName !== schoolId) {
          await School.findByIdAndUpdate(schoolId, { name: displayName }, { upsert: true })
        }
      }
    }
  }

}
