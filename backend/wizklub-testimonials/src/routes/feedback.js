import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { parseMultipartMultiple } from '../middleware/parseMultipart.js'
import {
  createFeedback,
  getFeedback,
  getFeedbackIssueSummary,
  listFeedback,
  updateFeedback,
} from '../services/feedback.js'
import {
  ALLOWED_MIME_TYPES,
  MAX_FEEDBACK_ATTACHMENTS,
  MAX_VIDEO_BYTES,
} from '../utils/constants.js'

const multipart = parseMultipartMultiple({
  fieldName: 'files',
  maxFiles: MAX_FEEDBACK_ATTACHMENTS,
  maxFileSize: MAX_VIDEO_BYTES,
  allowedMimeTypes: ALLOWED_MIME_TYPES,
  requireFiles: false,
})

export function createFeedbackRouter() {
  const router = Router()
  router.use(requireAuth)

  router.post('/feedback', multipart, async (req, res) => {
    const { school_id, batch_id, category, summary, priority } = req.body ?? {}

    try {
      const result = await createFeedback({
        teacherId: req.teacher.user_id,
        teacherName: req.teacher.full_name,
        schoolId: school_id,
        batchId: batch_id,
        category,
        summary,
        priority: priority || null,
        files: req.files ?? [],
      })

      if (!result.ok) {
        return res.status(result.status).json({ ok: false, error: result.error })
      }

      return res.status(result.status).json({
        ok: true,
        feedback: result.feedback,
        warning: result.warning || undefined,
      })
    } catch (err) {
      console.error('Feedback create failed:', err)
      return res.status(500).json({ ok: false, error: 'Failed to submit feedback.' })
    }
  })

  router.get('/feedback', async (req, res) => {
    try {
      const { school_id, batch_id, status, page, limit } = req.query ?? {}
      const result = await listFeedback({
        teacherId: req.teacher.user_id,
        schoolId: school_id || undefined,
        batchId: batch_id || undefined,
        status: status || undefined,
        page,
        limit,
      })
      return res.json(result)
    } catch (err) {
      console.error('Feedback list failed:', err)
      return res.status(500).json({ ok: false, error: 'Failed to load feedback.' })
    }
  })

  router.get('/feedback/summary', async (req, res) => {
    try {
      const { school_id, batch_id } = req.query ?? {}
      const result = await getFeedbackIssueSummary({
        teacherId: req.teacher.user_id,
        schoolId: school_id || undefined,
        batchId: batch_id || undefined,
      })
      return res.json(result)
    } catch (err) {
      console.error('Feedback summary failed:', err)
      return res.status(500).json({ ok: false, error: 'Failed to load feedback summary.' })
    }
  })

  router.get('/feedback/:feedbackId', async (req, res) => {
    try {
      const result = await getFeedback(req.params.feedbackId, req.teacher.user_id)
      if (!result.ok) {
        return res.status(result.status).json({ ok: false, error: result.error })
      }
      return res.json({ ok: true, feedback: result.feedback })
    } catch (err) {
      console.error('Feedback detail failed:', err)
      return res.status(500).json({ ok: false, error: 'Failed to load feedback.' })
    }
  })

  router.patch('/feedback/:feedbackId', async (req, res) => {
    try {
      const { status, resolution_note, priority } = req.body ?? {}
      const result = await updateFeedback(req.params.feedbackId, req.teacher.user_id, {
        status,
        resolution_note,
        priority,
      })
      if (!result.ok) {
        return res.status(result.status).json({ ok: false, error: result.error })
      }
      return res.json({ ok: true, feedback: result.feedback })
    } catch (err) {
      console.error('Feedback update failed:', err)
      return res.status(500).json({ ok: false, error: 'Failed to update feedback.' })
    }
  })

  return router
}
