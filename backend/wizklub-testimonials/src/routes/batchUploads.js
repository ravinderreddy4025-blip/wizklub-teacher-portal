import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { parseMultipartSingle } from '../middleware/parseMultipart.js'
import { addBatchUpload, listBatchUploads, deleteBatchUpload } from '../services/batchUploads.js'
import { ALLOWED_MIME_TYPES, MAX_VIDEO_BYTES } from '../utils/constants.js'

export function createBatchUploadsRouter() {
  const router = Router()
  router.use(requireAuth)

  router.post(
    '/batches/:batchId/batch-uploads',
    parseMultipartSingle({
      fieldName: 'file',
      maxFileSize: MAX_VIDEO_BYTES,
      allowedMimeTypes: ALLOWED_MIME_TYPES,
    }),
    async (req, res) => {
      const { batchId } = req.params

      try {
        const result = await addBatchUpload({
          batchId,
          teacherId: req.teacher.user_id,
          file: req.file,
          batchIds: req.batchIds,
          schoolIds: req.schoolIds,
        })

        if (!result.ok) {
          return res.status(result.status).json({ ok: false, error: result.error })
        }

        return res.status(result.status).json({ ok: true, upload: result.upload })
      } catch (err) {
        console.error('Batch upload failed:', err)
        return res.status(500).json({ ok: false, error: 'Upload failed. Check GCS configuration.' })
      }
    },
  )

  router.get('/batches/:batchId/batch-uploads', async (req, res) => {
    const { batchId } = req.params
    try {
      const uploads = await listBatchUploads(batchId)
      res.json({ ok: true, uploads })
    } catch (err) {
      console.error('Batch upload list failed:', err)
      res.json({ ok: true, uploads: [] })
    }
  })

  router.delete('/batch-uploads/:uploadId', async (req, res) => {
    try {
      const result = await deleteBatchUpload(req.params.uploadId, req.teacher.user_id)
      if (!result.ok) {
        return res.status(result.status).json({ ok: false, error: result.error })
      }
      return res.status(204).send()
    } catch (err) {
      console.error('Batch upload delete failed:', err)
      return res.status(500).json({ ok: false, error: 'Failed to remove upload.' })
    }
  })

  return router
}
