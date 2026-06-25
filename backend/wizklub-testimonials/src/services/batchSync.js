import { WIZKLUB_URLS } from '../utils/wizklubAuth.js'

export async function fetchBatchesForSchool(schoolId, instructorUsername, accessToken) {
  const params = new URLSearchParams({
    school_id: schoolId,
    instructor_username: instructorUsername,
    page_size: '50',
  })

  const url = `${WIZKLUB_URLS.batches}?${params}`

  try {
    const headers = { accept: 'application/json' }
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`
    }

    const response = await fetch(url, { headers })

    if (!response.ok) {
      console.error(`[BatchSync] ${schoolId} → status ${response.status}`)
      return null
    }

    return await response.json()
  } catch (err) {
    console.error(`[BatchSync] ${schoolId} → fetch error:`, err.message)
    return null
  }
}

export function extractBatches(payload) {
  if (!payload) return []

  const rawBatches =
    payload?.data?.batch_list ||
    payload?.data?.batches ||
    payload?.data?.items ||
    payload?.batches ||
    []

  if (!Array.isArray(rawBatches)) return []

  return rawBatches.map((b) => ({
    id: b.batch_id ?? b.id,
    name: b.batch_name ?? b.name ?? b.batch_id ?? 'Unnamed Batch',
    student_count: b.student_count ?? b.total_students ?? 0,
    grade: b.grade_id ?? b.grade ?? null,
    grade_name: b.grade_name ?? null,
    schedule: b.schedule_label ?? [],
  }))
}

export function filterByInstructorBatchIds(allBatches, instructorBatchIds) {
  if (!instructorBatchIds?.length) return allBatches
  const idSet = new Set(instructorBatchIds)
  return allBatches.filter((b) => idSet.has(b.id))
}
