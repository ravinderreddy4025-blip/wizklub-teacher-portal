import { WIZKLUB_URLS } from '../utils/wizklubAuth.js'

/**
 * Fetch average star rating for a batch from WizKlub v1.
 * Source: Postgres ``wizklub.feedback`` (Admin View Batch → Overall Average Rating).
 */
export async function fetchBatchFeedbackSummary(batchId, accessToken) {
  const url = WIZKLUB_URLS.batchFeedbackSummary(batchId)

  const headers = { accept: 'application/json' }
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`
  }

  const response = await fetch(url, { headers })
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    const message =
      payload?.message || payload?.error || `WizKlub feedback summary failed (${response.status})`
    const err = new Error(message)
    err.status = response.status
    throw err
  }

  const data = payload?.data ?? payload
  const grades = Array.isArray(data.grades)
    ? data.grades.map((g) => ({
        grade: g.grade || 'Unknown',
        value: Number(g.value) || 0,
        forms: Number(g.forms) || 0,
        tag: g.tag || null,
        tone: g.tone || 'mid',
      }))
    : []

  return {
    overall: Number(data.overall) || 0,
    forms: Number(data.forms) || 0,
    grades,
    batch_id: data.batch_id || batchId,
    batch_name: data.batch_name || '',
  }
}
