import { randomUUID } from 'crypto'
import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { Teacher } from '../db/models.js'
import { syncSchoolsAndBatches } from '../services/schoolSync.js'
import {
  deleteSession,
  getSession,
  replaceSession,
  storeSession,
} from '../services/sessionStore.js'
import { isDatabaseReady } from '../db/state.js'
import { WIZKLUB_URLS } from '../utils/wizklubAuth.js'

export function createAuthRouter() {
  const router = Router()

  router.post('/login', async (req, res) => {
    const { user_id, password } = req.body ?? {}

    if (!user_id || !password) {
      return res.status(400).json({ ok: false, error: 'User ID and password are required.' })
    }

    let authResponse
    try {
      authResponse = await fetch(WIZKLUB_URLS.login, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: user_id, password }),
      })
    } catch {
      return res.status(502).json({ ok: false, error: 'Wizklub auth service unavailable.' })
    }

    const authPayload = await authResponse.json().catch(() => ({}))
    if (!authResponse.ok) {
      const authError =
        authPayload?.message ||
        authPayload?.error ||
        authPayload?.detail ||
        'Invalid user ID or password.'
      return res.status(authResponse.status || 401).json({ ok: false, error: authError })
    }

    const { accessToken, refreshToken } = extractTokens(authPayload)
    if (!accessToken) {
      return res
        .status(502)
        .json({ ok: false, error: 'Auth API did not return an access token.' })
    }

    const user = authPayload?.user ?? authPayload?.data?.user ?? authPayload
    const inferredName =
      user?.full_name || user?.name || user?.instructor_name || user_id
    const schoolIds = user?.school_ids ?? []
    const batchIds = user?.batch_ids ?? []

    let teacher

    if (isDatabaseReady()) {
      teacher = await Teacher.findOne({ user_id }).lean()

      if (!teacher) {
        const teacherId = user?.id ?? `teacher-${randomUUID()}`
        await Teacher.create({
          _id: teacherId,
          user_id,
          password_hash: '',
          full_name: inferredName,
        })
        teacher = await Teacher.findOne({ user_id }).lean()
      } else if (teacher.full_name !== inferredName) {
        await Teacher.updateOne({ _id: teacher._id }, { full_name: inferredName })
        teacher = { ...teacher, full_name: inferredName }
      }
    } else {
      const teacherId = user?.id ?? `teacher-${user_id}`
      teacher = { _id: teacherId, user_id, full_name: inferredName }
    }

    if (schoolIds.length > 0) {
      try {
        await syncSchoolsAndBatches(teacher._id, schoolIds, batchIds, accessToken, user_id)
      } catch (err) {
        console.error('School/batch sync failed (non-blocking):', err.message)
      }
    }

    storeSession(accessToken, {
      teacherId: teacher._id,
      userId: user_id,
      fullName: teacher.full_name,
      refreshToken: refreshToken ?? null,
      schoolIds,
      batchIds,
    })

    return res.json({
      ok: true,
      token: accessToken,
      access_token: accessToken,
      refresh_token: refreshToken ?? null,
      teacher: { id: teacher._id, full_name: teacher.full_name, user_id: teacher.user_id },
    })
  })

  router.post('/refresh', async (req, res) => {
    const header = req.headers.authorization
    if (!header?.startsWith('Bearer ')) {
      return res.status(401).json({ ok: false, error: 'Authentication required.' })
    }

    const oldToken = header.slice(7)
    const session = getSession(oldToken)
    if (!session?.refreshToken || !session?.userId) {
      return res.status(401).json({ ok: false, error: 'No refresh token available.' })
    }

    let authResponse
    try {
      authResponse = await fetch(WIZKLUB_URLS.refresh, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: session.userId,
          refresh_token: session.refreshToken,
        }),
      })
    } catch {
      return res.status(502).json({ ok: false, error: 'Wizklub auth service unavailable.' })
    }

    const authPayload = await authResponse.json().catch(() => ({}))
    if (!authResponse.ok) {
      deleteSession(oldToken)
      return res.status(401).json({ ok: false, error: 'Refresh failed. Please log in again.' })
    }

    const { accessToken: newAccessToken, refreshToken: newRefreshToken } =
      extractTokens(authPayload)
    if (!newAccessToken) {
      return res.status(502).json({ ok: false, error: 'Refresh did not return a new token.' })
    }

    replaceSession(oldToken, newAccessToken, {
      refreshToken: newRefreshToken ?? session.refreshToken,
    })

    return res.json({
      ok: true,
      token: newAccessToken,
      access_token: newAccessToken,
      refresh_token: newRefreshToken ?? session.refreshToken,
    })
  })

  router.post('/logout', requireAuth, async (req, res) => {
    try {
      await fetch(WIZKLUB_URLS.logout, {
        method: 'POST',
        headers: { accept: 'application/json' },
      })
    } catch {
      // best-effort
    }

    deleteSession(req.accessToken)
    res.json({ ok: true })
  })

  router.get('/me', requireAuth, (req, res) => {
    res.json({
      id: req.teacher._id,
      full_name: req.teacher.full_name,
      user_id: req.teacher.user_id,
    })
  })

  return router
}

function extractTokens(payload) {
  const accessToken =
    payload?.access_token ||
    payload?.accessToken ||
    payload?.token ||
    payload?.data?.access_token ||
    payload?.data?.accessToken ||
    payload?.data?.token ||
    null

  const refreshToken =
    payload?.refresh_token ||
    payload?.refreshToken ||
    payload?.data?.refresh_token ||
    payload?.data?.refreshToken ||
    null

  return { accessToken, refreshToken }
}
