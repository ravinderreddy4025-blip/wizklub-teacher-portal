import { WIZKLUB_URLS } from '../utils/wizklubAuth.js'

export async function fetchStudentsForBatch(batchId, accessToken) {
  const url = WIZKLUB_URLS.batchStudents(batchId)

  try {
    const headers = { accept: 'application/json' }
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`
    }

    const response = await fetch(url, { headers })

    if (!response.ok) {
      console.error(`[StudentSync] ${batchId} → status ${response.status}`)
      return null
    }

    return await response.json()
  } catch (err) {
    console.error(`[StudentSync] ${batchId} → fetch error:`, err.message)
    return null
  }
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
    image: s.profile_image ?? s.image ?? s.avatar ?? null,
    username: s.username ?? null,
    school_id: s.school_id ?? null,
    school_name: s.school_name ?? null,
  }))
}
