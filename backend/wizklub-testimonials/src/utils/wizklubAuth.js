const WIZKLUB_BASE = String(process.env.WIZKLUB_API_BASE_URL || 'https://api.wizklub.com/v1')
  .trim()
  .replace(/\/$/, '')

export const WIZKLUB_URLS = {
  login: `${WIZKLUB_BASE}/auth/login`,
  refresh: `${WIZKLUB_BASE}/auth/refresh`,
  logout: `${WIZKLUB_BASE}/auth/logout`,
  schoolDetails: `${WIZKLUB_BASE}/school-details`,
  batches: `${WIZKLUB_BASE}/batches`,
  batchStudents: `${WIZKLUB_BASE}/batches/students`,
  batchFeedbackSummary: (batchId) =>
    `${WIZKLUB_BASE}/batches/${encodeURIComponent(batchId)}/feedback-summary`,
  batchProgressOverview: (batchId) =>
    `${WIZKLUB_BASE}/batches/${encodeURIComponent(batchId)}/progress-overview`,
}
