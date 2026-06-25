import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { parseMultipartSingle } from '../middleware/parseMultipart.js'
import { addBatchGroupMedia, listBatchGroupMedia, deleteBatchGroupMedia } from '../services/batchUploads.js'
import { ALLOWED_MIME_TYPES, MAX_VIDEO_BYTES } from '../utils/constants.js'

export function createBatchUploadsRouter() {
  const router = Router()
  router.use(requireAuth)

  router.post(
    '/batches/:batchId/group-photo',
    parseMultipartSingle({
      fieldName: 'file',
      maxFileSize: MAX_VIDEO_BYTES,
      allowedMimeTypes: ALLOWED_MIME_TYPES,
    }),
    async (req, res) => {
      const { batchId } = req.params

      try {
        const result = await addBatchGroupMedia({
          batchId,
          teacherId: req.teacher._id,
          file: req.file,
          batchIds: req.batchIds,
        })

        if (!result.ok) {
          return res.status(result.status).json({ ok: false, error: result.error })
        }

        return res.status(result.status).json({ ok: true, upload: result.upload })
      } catch (err) {
        console.error('Batch group media upload failed:', err)
        return res.status(500).json({ ok: false, error: 'Upload failed. Check GCS configuration.' })
      }
    },
  )

  router.get('/batches/:batchId/group-photos', async (req, res) => {
    const { batchId } = req.params
    const uploads = await listBatchGroupMedia(batchId)
    res.json({ ok: true, uploads })
  })

  router.delete('/batch-uploads/:uploadId', async (req, res) => {
    try {
      const result = await deleteBatchGroupMedia(req.params.uploadId, req.teacher._id)
      if (!result.ok) {
        return res.status(result.status).json({ ok: false, error: result.error })
      }
      return res.status(204).send()
    } catch (err) {
      console.error('Batch group media delete failed:', err)
      return res.status(500).json({ ok: false, error: 'Failed to remove upload.' })
    }
  })

  return router
}
