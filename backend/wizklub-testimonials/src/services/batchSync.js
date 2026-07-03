import { WIZKLUB_URLS } from '../utils/wizklubAuth.js'

const BATCH_PAGE_SIZE = '50'
const MAX_BATCH_PAGES = 50

async function fetchBatchesPage(schoolId, instructorUsername, accessToken, cursor = null) {
  const params = new URLSearchParams({
    school_id: schoolId,
    instructor_username: instructorUsername,
    page_size: BATCH_PAGE_SIZE,
  })
  if (cursor) {
    params.set('cursor', cursor)
  }

  const url = `${WIZKLUB_URLS.batches}?${params}`

  const headers = { accept: 'application/json' }
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`
  }

  const response = await fetch(url, { headers })

  if (!response.ok) {
    console.error(`[BatchSync] ${schoolId} → status ${response.status}`)
    return null
  }

  return response.json()
}

/** Single-page fetch (legacy shape: raw API JSON). */
export async function fetchBatchesForSchool(schoolId, instructorUsername, accessToken) {
  try {
    return await fetchBatchesPage(schoolId, instructorUsername, accessToken)
  } catch (err) {
    console.error(`[BatchSync] ${schoolId} → fetch error:`, err.message)
    return null
  }
}

/** Fetch every page using data.page_info.next_cursor until has_next_page is false. */
export async function fetchAllBatchesForSchool(schoolId, instructorUsername, accessToken) {
  const merged = []
  let cursor = null
  let pages = 0

  try {
    do {
      const payload = await fetchBatchesPage(schoolId, instructorUsername, accessToken, cursor)
      if (!payload) break

      merged.push(...extractBatches(payload))

      const pageInfo = payload?.data?.page_info
      if (pageInfo?.has_next_page && pageInfo?.next_cursor) {
        cursor = pageInfo.next_cursor
      } else {
        cursor = null
      }
      pages += 1
    } while (cursor && pages < MAX_BATCH_PAGES)
  } catch (err) {
    console.error(`[BatchSync] ${schoolId} → paginated fetch error:`, err.message)
  }

  return merged
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
