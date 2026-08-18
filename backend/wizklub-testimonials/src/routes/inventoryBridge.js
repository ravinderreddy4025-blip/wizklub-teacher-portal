import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { listInventorySchools, selectInventorySchool } from '../services/inventoryBridge.js'

export function createInventoryBridgeRouter() {
  const router = Router()

  router.get('/schools', requireAuth, async (req, res) => {
    try {
      const data = await listInventorySchools({
        schoolIds: req.schoolIds,
        wizklubToken: req.accessToken,
        instructorName: req.teacher.full_name || req.teacher.user_id,
        userId: req.teacher.user_id,
      })
      res.json({ ok: true, ...data })
    } catch (error) {
      res.status(error.status || 500).json({
        ok: false,
        error: error.message || 'Could not load inventory schools.',
      })
    }
  })

  router.post('/select-school', requireAuth, async (req, res) => {
    try {
      const schoolCode = String(req.body?.schoolCode || req.body?.schoolId || '').trim()
      if (!schoolCode) {
        return res.status(400).json({ ok: false, error: 'School ID is required.' })
      }

      const data = await selectInventorySchool({
        schoolCode,
        schoolIds: req.schoolIds,
        wizklubToken: req.accessToken,
        instructorName: req.teacher.full_name || req.teacher.user_id,
        userId: req.teacher.user_id,
      })

      res.json({ ok: true, ...data })
    } catch (error) {
      res.status(error.status || 500).json({
        ok: false,
        error: error.message || 'Could not open school inventory.',
      })
    }
  })

  return router
}
