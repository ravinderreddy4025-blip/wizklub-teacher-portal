const WIZKLUB_API_BASE = String(process.env.WIZKLUB_API_BASE_URL || 'https://api.wizklub.com')
  .trim()
  .replace(/\/$/, '')
  .replace(/\/v1$/i, '')

export const WIZKLUB_URLS = {
  login: `${WIZKLUB_API_BASE}/v1/auth/login`,
  refresh: `${WIZKLUB_API_BASE}/v1/auth/refresh`,
  logout: `${WIZKLUB_API_BASE}/v1/auth/logout`,
  schoolDetails: `${WIZKLUB_API_BASE}/v1/school-details`,
  schoolSummary: (schoolId) =>
    `${WIZKLUB_API_BASE}/v1/schools/${encodeURIComponent(schoolId)}`,
  batches: `${WIZKLUB_API_BASE}/v1/batches`,
  batchStudents: `${WIZKLUB_API_BASE}/v1/batches/students`,
  batchFeedbackSummary: (batchId) =>
    `${WIZKLUB_API_BASE}/v1/batches/${encodeURIComponent(batchId)}/feedback-summary`,
  batchProgressOverview: (batchId) =>
    `${WIZKLUB_API_BASE}/v1/batches/${encodeURIComponent(batchId)}/progress-overview`,
}
