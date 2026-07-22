import { WIZKLUB_URLS } from '../utils/wizklubAuth.js'
import { TeacherSchoolAssignment } from '../db/models.js'
import { isDatabaseReady } from '../db/state.js'
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

/**
 * Persist only teacher↔school assignments.
 * Do not cache schools/batches/students into Mongo — those stay API-sourced.
 */
export async function syncSchoolsAndBatches(teacherId, schoolIds) {
  if (!isDatabaseReady()) return

  await TeacherSchoolAssignment.deleteMany({ teacher_id: teacherId })

  for (const schoolId of schoolIds) {
    await TeacherSchoolAssignment.findOneAndUpdate(
      { teacher_id: teacherId, school_id: schoolId },
      { teacher_id: teacherId, school_id: schoolId },
      { upsert: true },
    )
  }
}
