import { WIZKLUB_URLS } from '../utils/wizklubAuth.js'
import { School, Batch, TeacherSchoolAssignment } from '../db/models.js'
import { fetchBatchesForSchool, extractBatches } from './batchSync.js'

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

function extractSchoolName(payload, schoolId) {
  if (!payload) return schoolId

  return (
    payload?.data?.school?.name ||
    payload?.data?.school_name ||
    payload?.data?.name ||
    payload?.school_name ||
    payload?.name ||
    schoolId
  )
}

export async function syncSchoolsAndBatches(teacherId, schoolIds, batchIds, accessToken, instructorUsername) {

  await TeacherSchoolAssignment.deleteMany({ teacher_id: teacherId })
  await Batch.deleteMany({ school_id: { $in: schoolIds } })

  const schoolDetailResults = await Promise.allSettled(
    schoolIds.map((id) => fetchSchoolDetails(id, accessToken)),
  )

  for (let i = 0; i < schoolIds.length; i++) {
    const schoolId = schoolIds[i]
    const result = schoolDetailResults[i]
    const payload = result.status === 'fulfilled' ? result.value : null
    const name = extractSchoolName(payload, schoolId)

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
      schoolIds.map((id) => fetchBatchesForSchool(id, instructorUsername, accessToken)),
    )

    for (let i = 0; i < schoolIds.length; i++) {
      const schoolId = schoolIds[i]
      const result = batchResults[i]
      const payload = result.status === 'fulfilled' ? result.value : null
      const allBatches = extractBatches(payload)

      const instructorBatches = batchIdSet.size > 0
        ? allBatches.filter((b) => batchIdSet.has(b.id))
        : allBatches

      for (const batch of instructorBatches) {
        await Batch.findByIdAndUpdate(batch.id, {
          school_id: schoolId,
          name: batch.name,
          grade: batch.grade,
          student_count: batch.student_count ?? 0,
        }, { upsert: true })
      }
    }
  }

}
