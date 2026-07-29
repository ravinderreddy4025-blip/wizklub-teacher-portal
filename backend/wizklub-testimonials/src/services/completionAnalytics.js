import { WIZKLUB_URLS } from '../utils/wizklubAuth.js'

/**
 * Batch progress overview from WizKlub:
 * session summary + completion tracker + assessment analysis.
 */
export async function fetchBatchProgressOverview(
  batchId,
  accessToken,
  { periodType = 'MONTHLY', limit = 10 } = {},
) {
  const params = new URLSearchParams({
    period_type: String(periodType || 'MONTHLY').toUpperCase(),
    limit: String(limit || 10),
  })
  const url = `${WIZKLUB_URLS.batchProgressOverview(batchId)}?${params}`
  const headers = { accept: 'application/json' }
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`

  const response = await fetch(url, { headers })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message =
      payload?.message || payload?.error || `WizKlub progress overview failed (${response.status})`
    const err = new Error(message)
    err.status = response.status
    throw err
  }

  const data = payload?.data ?? payload
  const session = data.session_summary || {}
  const completion = data.completion_tracker || {}
  const assessment = data.assessment_analysis || {}

  return {
    batch_id: data.batch_id || batchId,
    session_summary: {
      total: Number(session.total) || 0,
      done: Number(session.done) || 0,
      missed: Number(session.missed) || 0,
      cancelled: Number(session.cancelled) || 0,
      period_type: session.period_type || periodType,
    },
    completion_tracker: {
      student_count: Number(completion.student_count) || 0,
      items: Array.isArray(completion.items)
        ? completion.items.map((item) => ({
            label: item.label || '',
            key: item.key || '',
            delivery: Number(item.delivery) || 0,
            completion: Number(item.completion) || 0,
            planned: Number(item.planned) || 0,
            conducted: Number(item.conducted) || 0,
          }))
        : [],
    },
    assessment_analysis: {
      score_source: assessment.score_source || 'none',
      items: Array.isArray(assessment.items)
        ? assessment.items.map((item) => ({
            rank: Number(item.rank) || 0,
            student_id: item.student_id || '',
            name: item.name || item.student_id || '',
            score: Number(item.score) || 0,
            critical: Boolean(item.critical),
          }))
        : [],
    },
  }
}
