import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { TeacherLogin } from '../db/models.js'
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
    const lastLoginAt = new Date().toISOString()

    let teacher

    if (isDatabaseReady()) {
      const existing = await TeacherLogin.findOne({ user_id }).lean()
      if (existing) {
        await TeacherLogin.updateOne(
          { user_id },
          { full_name: inferredName, last_login_at: lastLoginAt },
        )
        teacher = { ...existing, full_name: inferredName, last_login_at: lastLoginAt }
      } else {
        teacher = await TeacherLogin.create({
          _id: user_id,
          user_id,
          full_name: inferredName,
          last_login_at: lastLoginAt,
          password_hash: '',
        })
        teacher = teacher.toObject()
      }
    } else {
      teacher = { _id: user_id, user_id, full_name: inferredName, last_login_at: lastLoginAt }
    }

    if (schoolIds.length > 0) {
      try {
        await syncSchoolsAndBatches(user_id, schoolIds, batchIds, accessToken, user_id)
      } catch (err) {
        console.error('School/batch sync failed (non-blocking):', err.message)
      }
    }

    storeSession(accessToken, {
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
      school_ids: schoolIds,
      batch_ids: batchIds,
      teacher: {
        id: user_id,
        full_name: teacher.full_name,
        user_id,
        last_login_at: teacher.last_login_at,
      },
    })
  })

  router.post('/refresh', async (req, res) => {
    const header = req.headers.authorization
    const oldToken = header?.startsWith('Bearer ') ? header.slice(7) : null
    const session = oldToken ? getSession(oldToken) : null
    const body = req.body ?? {}

    const userId = session?.userId ?? body.user_id ?? body.username ?? null
    const refreshTok = session?.refreshToken ?? body.refresh_token ?? null
    const schoolIds = session?.schoolIds?.length
      ? session.schoolIds
      : (Array.isArray(body.school_ids) ? body.school_ids : [])
    const batchIds = session?.batchIds?.length
      ? session.batchIds
      : (Array.isArray(body.batch_ids) ? body.batch_ids : [])

    if (!userId || !refreshTok) {
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
          username: userId,
          refresh_token: refreshTok,
        }),
      })
    } catch {
      return res.status(502).json({ ok: false, error: 'Wizklub auth service unavailable.' })
    }

    const authPayload = await authResponse.json().catch(() => ({}))
    if (!authResponse.ok) {
      if (oldToken) deleteSession(oldToken)
      return res.status(401).json({ ok: false, error: 'Refresh failed. Please log in again.' })
    }

    const { accessToken: newAccessToken, refreshToken: newRefreshToken } =
      extractTokens(authPayload)
    if (!newAccessToken) {
      return res.status(502).json({ ok: false, error: 'Refresh did not return a new token.' })
    }

    let fullName = session?.fullName ?? userId
    if (isDatabaseReady()) {
      const teacher = await TeacherLogin.findOne({ user_id: userId }).lean()
      if (teacher?.full_name) fullName = teacher.full_name
    }

    const nextRefresh = newRefreshToken ?? refreshTok
    const nextSession = {
      userId,
      fullName,
      refreshToken: nextRefresh,
      schoolIds,
      batchIds,
    }

    if (oldToken && session) {
      replaceSession(oldToken, newAccessToken, nextSession)
    } else {
      if (oldToken) deleteSession(oldToken)
      storeSession(newAccessToken, nextSession)
    }

    return res.json({
      ok: true,
      token: newAccessToken,
      access_token: newAccessToken,
      refresh_token: nextRefresh,
      school_ids: schoolIds,
      batch_ids: batchIds,
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
      id: req.teacher.user_id,
      full_name: req.teacher.full_name,
      user_id: req.teacher.user_id,
      last_login_at: req.teacher.last_login_at ?? null,
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
