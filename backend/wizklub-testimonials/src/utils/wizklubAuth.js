const WIZKLUB_BASE = 'https://api.wizklub.com/v1'

export const WIZKLUB_URLS = {
  login: `${WIZKLUB_BASE}/auth/instructor/login`,
  refresh: `${WIZKLUB_BASE}/auth/instructor/refresh`,
  logout: `${WIZKLUB_BASE}/auth/logout`,
  schoolDetails: `${WIZKLUB_BASE}/school-details`,
  batches: `${WIZKLUB_BASE}/batches`,
  batchStudents: (batchId) => `${WIZKLUB_BASE}/batches/${batchId}/students`,
}
