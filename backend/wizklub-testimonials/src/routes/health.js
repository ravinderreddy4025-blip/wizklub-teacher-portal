import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { teacherOwnsBatch } from '../services/access.js'
import { getAttention, getBatchHealth, getStudentHealth } from '../services/health.js'
import { resolveSchoolIds } from '../services/schoolResolve.js'

/**
 * Student health (HEALTH_CONTRACT v1) — read-only views over the `wizklub_health` snapshot.
 * Every endpoint answers `{ run: null }` (HTTP 200) when no snapshot exists yet.
 */
export function createHealthRouter() {
  const router = Router()
  router.use(requireAuth)

  const sessionScope = (req) => ({ batchIds: req.batchIds, schoolIds: req.schoolIds })

  /**
   * Same gate as the existing batch routes, then a stricter check against the snapshot's own
   * batch → school/teacher mapping (teacherOwnsBatch alone allows any batch once a school is assigned).
   */
  async function ownsSnapshotBatch(req, batch) {
    if (!batch) return true
    const userId = req.teacher.user_id
    if (batch.teacher?.username && String(batch.teacher.username) === String(userId)) return true
    if ((req.batchIds ?? []).map(String).includes(String(batch.batch_id))) return true
    const schoolIds = (await resolveSchoolIds(userId, req.schoolIds)).map(String)
    return schoolIds.includes(String(batch.school_id))
  }

  router.get('/batches/:batchId/health', async (req, res, next) => {
    try {
      const { batchId } = req.params
      if (!(await teacherOwnsBatch(req.teacher.user_id, batchId, sessionScope(req)))) {
        return res.status(403).json({ forbidden: true })
      }
      const payload = await getBatchHealth(batchId)
      if (payload.run && !(await ownsSnapshotBatch(req, payload.batch))) {
        return res.status(403).json({ forbidden: true })
      }
      return res.json(payload)
    } catch (err) {
      return next(err)
    }
  })

  router.get('/batches/:batchId/students/:username/health', async (req, res, next) => {
    try {
      const { batchId, username } = req.params
      if (!(await teacherOwnsBatch(req.teacher.user_id, batchId, sessionScope(req)))) {
        return res.status(403).json({ forbidden: true })
      }
      const payload = await getStudentHealth(batchId, username)
      if (payload.run && !(await ownsSnapshotBatch(req, payload.batch))) {
        return res.status(403).json({ forbidden: true })
      }
      return res.json(payload)
    } catch (err) {
      return next(err)
    }
  })

  router.get('/health/attention', async (req, res, next) => {
    try {
      const schoolIds = await resolveSchoolIds(req.teacher.user_id, req.schoolIds)
      const payload = await getAttention({
        teacherUsername: req.teacher.user_id,
        batchIds: req.batchIds ?? [],
        schoolIds,
      })
      return res.json(payload)
    } catch (err) {
      return next(err)
    }
  })

  return router
}
