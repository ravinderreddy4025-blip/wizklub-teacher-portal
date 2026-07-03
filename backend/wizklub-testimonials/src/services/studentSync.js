import { WIZKLUB_URLS } from '../utils/wizklubAuth.js'

const STUDENT_PAGE_SIZE = '100'
const MAX_STUDENT_PAGES = 50

async function fetchStudentsPage(schoolId, batchId, accessToken, cursor = null) {
  const params = new URLSearchParams({
    school_id: schoolId,
    batch_id: batchId,
    page_size: STUDENT_PAGE_SIZE,
    login_status: 'all',
  })
  if (cursor) {
    params.set('cursor', cursor)
  }

  const url = `${WIZKLUB_URLS.batchStudents}?${params}`
  const headers = { accept: 'application/json' }
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`
  }

  const response = await fetch(url, { headers })

  if (!response.ok) {
    console.error(`[StudentSync] school=${schoolId} batch=${batchId} → status ${response.status}`)
    return null
  }

  return response.json()
}

/** Fetch all students for a batch (paginated). Requires school_id per Wizklub OpenAPI. */
export async function fetchAllStudentsForBatch(schoolId, batchId, accessToken) {
  if (!schoolId || !batchId) return []

  const merged = []
  let cursor = null
  let pages = 0

  try {
    do {
      const payload = await fetchStudentsPage(schoolId, batchId, accessToken, cursor)
      if (!payload) break

      merged.push(...extractStudents(payload))

      const pageInfo = payload?.data?.page_info
      if (pageInfo?.has_next_page && pageInfo?.next_cursor) {
        cursor = pageInfo.next_cursor
      } else {
        cursor = null
      }
      pages += 1
    } while (cursor && pages < MAX_STUDENT_PAGES)
  } catch (err) {
    console.error(`[StudentSync] school=${schoolId} batch=${batchId} → fetch error:`, err.message)
  }

  return merged
}

export function extractStudents(payload) {
  if (!payload) return []

  const rawStudents =
    payload?.data?.students ||
    payload?.data?.student_list ||
    payload?.data?.items ||
    payload?.students ||
    []

  if (!Array.isArray(rawStudents)) return []

  return rawStudents.map((s) => ({
    id: s.username ?? s.student_id ?? s.id,
    full_name: s.name ?? s.student_name ?? s.full_name ?? 'Unknown',
    roll_number: s.admission_no ?? s.roll_number ?? s.username ?? '',
    image: s.profile_image_url ?? s.profile_image ?? s.image ?? s.avatar ?? null,
    batch_name: s.batch_name ?? null,
    username: s.username ?? null,
    school_id: s.school_id ?? null,
    school_name: s.school_name ?? null,
  }))
}
