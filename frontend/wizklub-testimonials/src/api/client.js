/**
 * Shared API client — matches /api/teacher/* contract from tech spec.
 * Set VITE_USE_MOCK=false to use the real backend.
 */

import { validateGroupPhotoFile, validateUploadFile } from '../lib/uploads'
import {
  batchAssessmentSessionsPath,
  batchSessionConductPath,
  batchSessionLevelMediaPath,
  batchSessionLevelResponsesPath,
  batchSessionLevelResponseDeletePath,
  batchSessionSubmitPath,
} from './batchSessionPaths'

const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false'
const API_BASE =
  import.meta.env.VITE_API_URL ?? (import.meta.env.BASE_URL || '').replace(/\/$/, '')
const WIZKLUB_API_BASE = String(
  import.meta.env.VITE_WIZKLUB_API_BASE_URL || 'https://api.wizklub.com',
)
  .trim()
  .replace(/\/$/, '')
  .replace(/\/v1$/i, '')

let authToken = null
let refreshToken = null
let sessionUserId = null
let sessionSchoolIds = []
let sessionBatchIds = []
let isRefreshing = false
let refreshPromise = null

function setAuthToken(token) {
  authToken = token
}

function setRefreshToken(token) {
  refreshToken = token
}

function setSessionMeta({ userId, schoolIds, batchIds } = {}) {
  if (userId !== undefined) sessionUserId = userId
  if (schoolIds !== undefined) sessionSchoolIds = Array.isArray(schoolIds) ? schoolIds : []
  if (batchIds !== undefined) sessionBatchIds = Array.isArray(batchIds) ? batchIds : []
}

function persistTokens(nextAccess, nextRefresh) {
  const SESSION_KEY = 'teacher_session'
  for (const store of [localStorage, sessionStorage]) {
    const saved = store.getItem(SESSION_KEY)
    if (!saved) continue
    try {
      const parsed = JSON.parse(saved)
      parsed.token = nextAccess
      parsed.refresh_token = nextRefresh
      if (sessionUserId) parsed.user_id = sessionUserId
      if (sessionSchoolIds.length) parsed.school_ids = sessionSchoolIds
      if (sessionBatchIds.length) parsed.batch_ids = sessionBatchIds
      store.setItem(SESSION_KEY, JSON.stringify(parsed))
    } catch { /* ignore */ }
  }
}

async function tryRefresh() {
  if (!refreshToken || !sessionUserId) return false
  if (isRefreshing) return refreshPromise

  isRefreshing = true
  refreshPromise = (async () => {
    try {
      const headers = { 'Content-Type': 'application/json' }
      if (authToken) headers.Authorization = `Bearer ${authToken}`

      const response = await fetch(`${API_BASE}/api/teacher/refresh`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          user_id: sessionUserId,
          refresh_token: refreshToken,
          school_ids: sessionSchoolIds,
          batch_ids: sessionBatchIds,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.token) return false

      authToken = data.token
      refreshToken = data.refresh_token ?? refreshToken
      if (Array.isArray(data.school_ids)) sessionSchoolIds = data.school_ids
      if (Array.isArray(data.batch_ids)) sessionBatchIds = data.batch_ids
      persistTokens(authToken, refreshToken)

      return true
    } catch {
      return false
    } finally {
      isRefreshing = false
      refreshPromise = null
    }
  })()

  return refreshPromise
}

async function request(path, options = {}, base = API_BASE) {
  const headers = { ...(options.headers ?? {}) }

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`
  }

  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }

  let response = await fetch(`${base}${path}`, {
    ...options,
    headers,
  })

  if (response.status === 401 && refreshToken) {
    const refreshed = await tryRefresh()
    if (refreshed) {
      headers.Authorization = `Bearer ${authToken}`
      response = await fetch(`${base}${path}`, { ...options, headers })
    }
  }

  if (response.status === 204) {
    return { ok: true, status: 204 }
  }

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: data.error ?? 'Request failed.',
      ...data,
    }
  }

  return { ok: true, status: response.status, data }
}

async function loadMockStore() {
  const { mockStore } = await import('./mockStore')
  const { getBatchCompletion, getStudentCompletion } = await import('../lib/completion')
  const { HEALTH_TAG_LABELS } = await import('./constants')
  return { mockStore, getBatchCompletion, getStudentCompletion, HEALTH_TAG_LABELS }
}

function enrichBatches(batchPayload, getBatchCompletion, uploads, HEALTH_TAG_LABELS) {
  return {
    ...batchPayload,
    batches: batchPayload.batches.map((batch) => {
      const { completion_avg, health_tag } = getBatchCompletion(uploads, batch.student_ids)
      return {
        id: batch.id,
        name: batch.name,
        student_count: batch.student_count,
        completion_avg,
        health_tag,
        health_label: HEALTH_TAG_LABELS[health_tag],
      }
    }),
  }
}

function enrichStudentDetail(detail, getStudentCompletion, uploads) {
  const completion = getStudentCompletion(uploads, detail.student.id)

  return {
    ...detail,
    student: {
      ...detail.student,
      completion_pct: completion.completion_pct,
      categories_done: completion.categories_done,
      categories_total: completion.categories_total,
      status: completion.status,
    },
    categories: completion.categories.map((row) => ({
      category: row.category,
      complete: row.complete,
      drafts: row.drafts,
      submitted: row.submitted,
    })),
  }
}

export const api = {
  async login(user_id, password) {
    if (USE_MOCK) {
      const { mockStore } = await loadMockStore()
      const result = mockStore.login(user_id, password)
      if (!result.ok) return { ok: false, error: result.error }
      return { ok: true, teacher: result.teacher }
    }

    const result = await request('/api/teacher/login', {
      method: 'POST',
      body: JSON.stringify({ user_id, password }),
    })

    if (!result.ok) return { ok: false, error: result.error }

    setAuthToken(result.data.token)
    setRefreshToken(result.data.refresh_token ?? null)
    setSessionMeta({
      userId: result.data.teacher?.user_id ?? result.data.teacher?.id,
      schoolIds: result.data.school_ids ?? [],
      batchIds: result.data.batch_ids ?? [],
    })
    return {
      ok: true,
      teacher: result.data.teacher,
      token: result.data.token,
      refresh_token: result.data.refresh_token ?? null,
      school_ids: result.data.school_ids ?? [],
      batch_ids: result.data.batch_ids ?? [],
    }
  },

  async logout() {
    if (USE_MOCK) {
      const { mockStore } = await loadMockStore()
      mockStore.logout()
    } else {
      await request('/api/teacher/logout', { method: 'POST' })
      setAuthToken(null)
      setRefreshToken(null)
      setSessionMeta({ userId: null, schoolIds: [], batchIds: [] })
    }
    return { ok: true }
  },

  async getMe() {
    if (USE_MOCK) {
      const { mockStore } = await loadMockStore()
      return mockStore.getMe()
    }

    const result = await request('/api/teacher/me')
    if (!result.ok) return null
    return result.data
  },

  restoreSession(session) {
    if (USE_MOCK) {
      return import('./mockStore').then(({ mockStore }) => mockStore.restoreSession(session.id))
    }

    if (session?.token) {
      setAuthToken(session.token)
      setRefreshToken(session?.refresh_token ?? null)
      setSessionMeta({
        userId: session.user_id ?? session.id ?? null,
        schoolIds: session.school_ids ?? [],
        batchIds: session.batch_ids ?? [],
      })
      return api.getMe()
    }

    return Promise.resolve(null)
  },

  async getDashboard() {
    if (USE_MOCK) {
      const { mockStore } = await loadMockStore()
      return mockStore.getDashboard()
    }

    const result = await request('/api/teacher/dashboard')
    return result.ok ? result.data : null
  },

  async getSchools() {
    if (USE_MOCK) {
      const { mockStore } = await loadMockStore()
      return mockStore.getSchools()
    }

    const result = await request('/api/teacher/schools')
    return result.ok ? result.data : null
  },

  async getBatches(schoolId) {
    if (USE_MOCK) {
      const { mockStore, getBatchCompletion, HEALTH_TAG_LABELS } = await loadMockStore()
      const batchResult = mockStore.getBatches(schoolId)
      if (!batchResult) return null
      if (batchResult.forbidden) return { forbidden: true }
      return enrichBatches(batchResult, getBatchCompletion, mockStore.getUploads(), HEALTH_TAG_LABELS)
    }

    const result = await request(`/api/teacher/schools/${schoolId}/batches`)
    if (result.status === 403) return { forbidden: true }
    if (!result.ok) return null
    return result.data
  },

  async getStudents(batchId, filter = 'all', schoolId = '') {
    if (USE_MOCK) {
      const { mockStore } = await loadMockStore()
      const studentResult = mockStore.getStudents(batchId, filter)
      if (!studentResult) return null
      if (studentResult.forbidden) return { forbidden: true }
      return studentResult
    }

    const params = new URLSearchParams({ filter })
    if (schoolId) params.set('school_id', schoolId)
    const result = await request(`/api/teacher/batches/${batchId}/students?${params}`)
    if (result.status === 403) return { forbidden: true }
    if (!result.ok) return null
    return result.data
  },

  async getBatchAssessments(batchId) {
    if (USE_MOCK) {
      const { mockStore } = await loadMockStore()
      const assessmentResult = mockStore.getBatchAssessments(batchId)
      if (!assessmentResult) return null
      if (assessmentResult.forbidden) return { forbidden: true }
      return assessmentResult
    }

    const path = batchAssessmentSessionsPath(batchId)
    const result = await request(path, {}, WIZKLUB_API_BASE)
    if (result.status === 403) return { forbidden: true }
    if (!result.ok) return null
    const payload = result.data
    return payload?.data ?? payload
  },

  async getAssessmentConduct(batchId, sessionId) {
    if (USE_MOCK) {
      const { mockStore } = await loadMockStore()
      const conductResult = mockStore.getAssessmentConduct(batchId, sessionId)
      if (!conductResult) return null
      if (conductResult.forbidden) return { forbidden: true }
      return conductResult
    }

    const path = batchSessionConductPath(batchId, sessionId)
    const result = await request(path, {}, WIZKLUB_API_BASE)
    if (result.status === 403) return { forbidden: true }
    if (!result.ok) {
      return {
        error: true,
        status: result.status,
        message: result.data?.message || result.data?.error || 'Failed to load assessment conduct context.',
      }
    }
    const payload = result.data
    return payload?.data ?? payload
  },

  async getAssessmentQuestionMedia(batchId, sessionId, questionId) {
    if (USE_MOCK) {
      const { mockStore } = await loadMockStore()
      const conductResult = mockStore.getAssessmentConduct(batchId, sessionId)
      if (!conductResult || conductResult.forbidden) return null
      const questions = conductResult.questions || []
      return questions.find((q) => q.question_id === questionId) || null
    }

    const path = batchSessionLevelMediaPath(batchId, sessionId, questionId)
    const result = await request(path, {}, WIZKLUB_API_BASE)
    if (result.status === 403) return { forbidden: true }
    if (!result.ok) return null
    const payload = result.data
    return payload?.data ?? payload
  },

  async getQuestionResponses(batchId, sessionId, questionId) {
    if (USE_MOCK) {
      const { mockStore } = await loadMockStore()
      return mockStore.getQuestionResponses(batchId, sessionId, questionId)
    }

    const path = batchSessionLevelResponsesPath(batchId, sessionId, questionId)
    const result = await request(path, {}, WIZKLUB_API_BASE)
    if (result.status === 403) return { forbidden: true }
    if (!result.ok) return null
    const payload = result.data
    return payload?.data ?? payload
  },

  async saveQuestionResponses(batchId, sessionId, questionId, responses) {
    if (USE_MOCK) {
      const { mockStore } = await loadMockStore()
      return mockStore.saveQuestionResponses(batchId, sessionId, questionId, responses)
    }

    const path = batchSessionLevelResponsesPath(batchId, sessionId, questionId)
    const result = await request(
      path,
      {
        method: 'POST',
        body: JSON.stringify({ responses }),
      },
      WIZKLUB_API_BASE,
    )
    if (result.status === 403) return { forbidden: true }
    if (!result.ok) {
      return {
        ok: false,
        status: result.status,
        error: result.message || result.error || 'Failed to save scan.',
      }
    }
    const payload = result.data
    return { ok: true, data: payload?.data ?? payload }
  },

  async deleteQuestionResponse(batchId, sessionId, questionId, studentId) {
    if (USE_MOCK) {
      const { mockStore } = await loadMockStore()
      return mockStore.deleteQuestionResponse(batchId, sessionId, questionId, studentId)
    }

    const path = batchSessionLevelResponseDeletePath(batchId, sessionId, questionId, studentId)
    const result = await request(path, { method: 'DELETE' }, WIZKLUB_API_BASE)
    if (result.status === 403) return { forbidden: true }
    return { ok: result.ok }
  },

  async submitAssessment(batchId, sessionId, body) {
    if (USE_MOCK) {
      const { mockStore } = await loadMockStore()
      return mockStore.submitAssessment(batchId, sessionId, body)
    }

    const path = batchSessionSubmitPath(batchId, sessionId)
    const result = await request(
      path,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      WIZKLUB_API_BASE,
    )
    if (result.status === 403) return { forbidden: true }
    if (!result.ok) {
      return {
        ok: false,
        status: result.status,
        error: result.message || result.error || 'Failed to submit assessment.',
      }
    }
    const payload = result.data
    return { ok: true, data: payload?.data ?? payload }
  },

  async getStudent(studentId) {
    if (USE_MOCK) {
      const { mockStore, getStudentCompletion } = await loadMockStore()
      const detail = mockStore.getStudent(studentId)
      if (!detail) return null
      if (detail.forbidden) return { forbidden: true }
      return enrichStudentDetail(detail, getStudentCompletion, mockStore.getUploads())
    }

    const result = await request(`/api/teacher/students/${studentId}`)
    if (result.status === 403) return { forbidden: true }
    if (!result.ok) return null
    return result.data
  },

  async getProgressOverview(batchId, { periodType = 'MONTHLY', limit = 10 } = {}) {
    if (USE_MOCK) {
      return {
        session_summary: {
          total: 42,
          done: 28,
          missed: 10,
          cancelled: 4,
          period_type: periodType,
        },
        completion_tracker: {
          items: [
            { label: 'Practical Lab Sessions', delivery: 85, completion: 72 },
            { label: 'Theory & Lectures', delivery: 78, completion: 64 },
            { label: 'Monthly Assessments', delivery: 92, completion: 81 },
          ],
        },
        assessment_analysis: {
          items: [
            { rank: 1, name: 'Alex Johnson', score: 42, critical: true },
            { rank: 2, name: 'Sarah Miller', score: 45, critical: true },
            { rank: 3, name: 'Chris Evans', score: 51, critical: false },
            { rank: 4, name: 'Emma Watson', score: 53, critical: false },
          ],
        },
      }
    }

    const params = new URLSearchParams({
      period_type: periodType,
      limit: String(limit),
    })
    const result = await request(
      `/api/teacher/batches/${encodeURIComponent(batchId)}/progress-overview?${params}`,
    )
    if (result.status === 403) return { forbidden: true }
    if (!result.ok) return null
    return result.data
  },

  async getLmsTime() {
    if (USE_MOCK) {
      const { mockStore } = await loadMockStore()
      return mockStore.getLmsTime?.() ?? {
        configured: true,
        hours: 48,
        minutes: 2880,
        period_days: 14,
        display: '48h',
        weekly_bars: [38, 42, 35, 70],
        label: 'Your LMS time (14 days)',
      }
    }

    const result = await request('/api/teacher/lms-time')
    if (!result.ok) return null
    return result.data
  },

  async getFeedbackSummary(batchId) {
    if (USE_MOCK) {
      const { mockStore } = await loadMockStore()
      return mockStore.getFeedbackSummary?.(batchId) ?? {
        overall: 4.8,
        forms: 134,
        grades: [
          { grade: 'Grade 8', value: 4.9, tag: 'Highest', tone: 'high' },
          { grade: 'Grade 7', value: 4.7, tag: null, tone: 'mid' },
          { grade: 'Grade 9', value: 4.2, tag: 'Lowest', tone: 'low' },
        ],
      }
    }

    const result = await request(
      `/api/teacher/batches/${encodeURIComponent(batchId)}/feedback-summary`,
    )
    if (result.status === 403) return { forbidden: true }
    if (!result.ok) return null
    return result.data
  },

  async getUploadStats(batchId, schoolId = '') {
    if (USE_MOCK) {
      return {
        total_uploads: 24,
        student_uploads: 24,
        batch_uploads: 0,
        recent: [
          { initials: 'AS', label: 'Alex' },
          { initials: 'MM', label: 'Mia' },
          { initials: 'JD', label: 'Jordan' },
        ],
        extra: 3,
      }
    }

    const params = new URLSearchParams()
    if (schoolId) params.set('school_id', schoolId)
    const qs = params.toString()
    const result = await request(
      `/api/teacher/batches/${encodeURIComponent(batchId)}/upload-stats${qs ? `?${qs}` : ''}`,
    )
    if (result.status === 403) return { forbidden: true }
    if (!result.ok) return null
    return result.data
  },

  async uploadMedia(studentId, category, file) {
    const validation = validateUploadFile(file)
    if (!validation.ok) return { ok: false, status: 415, error: validation.error }

    if (USE_MOCK) {
      const { mockStore } = await loadMockStore()
      const previewUrl = URL.createObjectURL(file)
      return mockStore.addUpload(studentId, category, file, previewUrl)
    }

    const formData = new FormData()
    formData.append('file', file)
    formData.append('category', category)

    const result = await request(`/api/teacher/students/${studentId}/uploads`, {
      method: 'POST',
      body: formData,
    })

    if (!result.ok) return { ok: false, status: result.status, error: result.error }
    return { ok: true, status: result.status, upload: result.data.upload }
  },

  async deleteUpload(uploadId) {
    if (USE_MOCK) {
      const { mockStore } = await loadMockStore()
      return mockStore.deleteUpload(uploadId)
    }

    const result = await request(`/api/teacher/uploads/${uploadId}`, { method: 'DELETE' })
    if (!result.ok) return { ok: false, status: result.status, error: result.error }
    return { ok: true, status: 204 }
  },

  async submitCategory(studentId, category) {
    if (USE_MOCK) {
      const { mockStore } = await loadMockStore()
      return mockStore.submitCategory(studentId, category)
    }

    const result = await request(
      `/api/teacher/students/${studentId}/categories/${category}/submit`,
      { method: 'POST' },
    )

    if (!result.ok) return { ok: false, status: result.status, error: result.error }
    return {
      ok: true,
      status: result.status,
      submitted_count: result.data.submitted_count,
      submitted_at: result.data.submitted_at,
    }
  },

  async uploadBatchGroupPhoto(file, batchId) {
    const validation = validateGroupPhotoFile(file)
    if (!validation.ok) return { ok: false, status: 415, error: validation.error }

    if (!batchId) return { ok: false, status: 400, error: 'Batch is required.' }

    const formData = new FormData()
    formData.append('file', file)

    const result = await request(`/api/teacher/batches/${batchId}/batch-uploads`, {
      method: 'POST',
      body: formData,
    })

    if (!result.ok) return { ok: false, status: result.status, error: result.error }
    return { ok: true, status: result.status, upload: result.data.upload }
  },

  async uploadBatchGroupPhotos(files, batchId) {
    const results = []
    for (const file of files) {
      const result = await api.uploadBatchGroupPhoto(file, batchId)
      results.push(result)
    }
    return results
  },

  async getBatchGroupPhotos(batchId) {
    const result = await request(`/api/teacher/batches/${batchId}/batch-uploads`)
    if (!result.ok) return []
    return result.data.uploads ?? []
  },

  async deleteBatchGroupPhoto(uploadId) {
    const result = await request(`/api/teacher/batch-uploads/${uploadId}`, { method: 'DELETE' })
    if (!result.ok) return { ok: false, status: result.status, error: result.error }
    return { ok: true, status: 204 }
  },

  async listFeedback({ school_id, batch_id, status, page = 1, limit = 20 } = {}) {
    if (USE_MOCK) {
      const { mockStore } = await loadMockStore()
      return mockStore.listFeedback({ school_id, batch_id, status, page, limit })
    }

    const params = new URLSearchParams()
    if (school_id) params.set('school_id', school_id)
    if (batch_id) params.set('batch_id', batch_id)
    if (status) params.set('status', status)
    params.set('page', String(page))
    params.set('limit', String(limit))

    const result = await request(`/api/teacher/feedback?${params}`)
    if (!result.ok) return { ok: false, error: result.error, items: [] }
    return result.data
  },

  async getTechIssueSummary({ school_id, batch_id } = {}) {
    if (USE_MOCK) {
      return { total: 12, open: 3, in_progress: 4, closed: 5 }
    }

    const params = new URLSearchParams()
    if (school_id) params.set('school_id', school_id)
    if (batch_id) params.set('batch_id', batch_id)

    const qs = params.toString()
    const result = await request(`/api/teacher/feedback/summary${qs ? `?${qs}` : ''}`)
    if (!result.ok) return null
    return result.data
  },

  async getFeedback(feedbackId) {
    if (USE_MOCK) {
      const { mockStore } = await loadMockStore()
      return mockStore.getFeedback(feedbackId)
    }

    const result = await request(`/api/teacher/feedback/${encodeURIComponent(feedbackId)}`)
    if (!result.ok) return { ok: false, status: result.status, error: result.error }
    return { ok: true, feedback: result.data.feedback }
  },

  async createFeedback({ school_id, batch_id, category, summary, priority, files = [] }) {
    for (const file of files) {
      const validation = validateUploadFile(file)
      if (!validation.ok) return { ok: false, status: 415, error: validation.error }
    }

    if (USE_MOCK) {
      const { mockStore } = await loadMockStore()
      return mockStore.createFeedback({
        school_id,
        batch_id,
        category,
        summary,
        priority,
        files,
      })
    }

    const formData = new FormData()
    formData.append('school_id', school_id)
    formData.append('batch_id', batch_id)
    formData.append('category', category)
    formData.append('summary', summary)
    if (priority) formData.append('priority', priority)
    for (const file of files) {
      formData.append('files', file)
    }

    const result = await request('/api/teacher/feedback', {
      method: 'POST',
      body: formData,
    })

    if (!result.ok) return { ok: false, status: result.status, error: result.error }
    return {
      ok: true,
      status: result.status,
      feedback: result.data.feedback,
      warning: result.data.warning,
    }
  },

  async updateFeedback(feedbackId, payload) {
    if (USE_MOCK) {
      const { mockStore } = await loadMockStore()
      return mockStore.updateFeedback(feedbackId, payload)
    }

    const result = await request(`/api/teacher/feedback/${encodeURIComponent(feedbackId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })

    if (!result.ok) return { ok: false, status: result.status, error: result.error }
    return { ok: true, feedback: result.data.feedback }
  },

  async listInventorySchools() {
    const result = await request('/api/teacher/inventory/schools')
    if (!result.ok) {
      return { ok: false, error: result.error || result.data?.error || 'Could not load inventory schools.' }
    }
    return { ok: true, ...result.data }
  },

  async selectInventorySchool(schoolCode) {
    const result = await request('/api/teacher/inventory/select-school', {
      method: 'POST',
      body: JSON.stringify({ schoolCode }),
    })
    if (!result.ok) {
      return { ok: false, error: result.error || result.data?.error || 'Could not open school inventory.' }
    }
    return { ok: true, ...result.data }
  },
}
