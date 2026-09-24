import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { parseMultipartSingle } from '../middleware/parseMultipart.js'
import { teacherOwnsStudent } from '../services/access.js'
import { createUpload, deleteUpload, submitCategory } from '../services/uploads.js'
import { ALLOWED_MIME_TYPES, MAX_VIDEO_BYTES } from '../utils/constants.js'

export function createUploadsRouter() {
  const router = Router()
  router.use(requireAuth)

  router.post(
    '/students/:studentId/uploads',
    parseMultipartSingle({
      fieldName: 'file',
      maxFileSize: MAX_VIDEO_BYTES,
      allowedMimeTypes: ALLOWED_MIME_TYPES,
    }),
    async (req, res) => {
    const { studentId } = req.params
    const { category } = req.body ?? {}

    if (!(await teacherOwnsStudent(req.teacher.user_id, studentId, {
      batchIds: req.batchIds,
      schoolIds: req.schoolIds,
    }))) {
      return res.status(403).json({ ok: false, error: 'You do not have access to this student.' })
    }

    if (!category) {
      return res.status(400).json({ ok: false, error: 'Category is required.' })
    }

    try {
      const result = await createUpload({
        studentId,
        teacherId: req.teacher.user_id,
        category,
        file: req.file,
      })

      if (!result.ok) {
        return res.status(result.status).json({ ok: false, error: result.error })
      }

      return res.status(result.status).json({ ok: true, upload: result.upload })
    } catch (err) {
      console.error('S3 upload failed:', err)
      return res.status(500).json({ ok: false, error: 'Upload failed. Check S3 configuration.' })
    }
  },
  )

  router.delete('/uploads/:uploadId', async (req, res) => {
    try {
      const result = await deleteUpload(req.params.uploadId, req.teacher.user_id)
      if (!result.ok) {
        return res.status(result.status).json({ ok: false, error: result.error })
      }
      return res.status(204).send()
    } catch (err) {
      console.error('S3 delete failed:', err)
      return res.status(500).json({ ok: false, error: 'Failed to remove upload.' })
    }
  })

  router.post('/students/:studentId/categories/:category/submit', async (req, res) => {
    const { studentId, category } = req.params

    if (!(await teacherOwnsStudent(req.teacher.user_id, studentId, {
      batchIds: req.batchIds,
      schoolIds: req.schoolIds,
    }))) {
      return res.status(403).json({ ok: false, error: 'You do not have access to this student.' })
    }

    const result = await submitCategory(studentId, category, req.teacher.user_id)
    if (!result.ok) {
      return res.status(result.status).json({ ok: false, error: result.error })
    }

    return res.json({
      ok: true,
      submitted_count: result.submitted_count,
      submitted_at: result.submitted_at,
    })
  })

  return router
}
