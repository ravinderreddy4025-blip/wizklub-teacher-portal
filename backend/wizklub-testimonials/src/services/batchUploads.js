import { v4 as uuidv4 } from 'uuid'
import { ALLOWED_MIME_TYPES, BATCH_GROUP_PHOTO_SEGMENT, MAX_PHOTO_BYTES, MAX_VIDEO_BYTES, UPLOAD_STATUS } from '../utils/constants.js'
import { uploadToGCS, deleteFromGCS } from './storage.js'
import { teacherOwnsBatch, mapBatchUploadRow } from './access.js'
import { BatchUpload } from '../db/models.js'

export function validateGroupMediaFile(file) {
  if (!file) return { ok: false, error: 'No file selected.' }

  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return { ok: false, error: 'Unsupported file type. Photos: JPG, PNG, WEBP, HEIC, GIF, TIFF. Videos: MP4, MOV, 3GP, MKV, WEBM, AVI, M4V.' }
  }

  const isVideo = file.mimetype.startsWith('video/')
  const maxSize = isVideo ? MAX_VIDEO_BYTES : MAX_PHOTO_BYTES

  if (file.size > maxSize) {
    const limitMb = Math.round(maxSize / (1024 * 1024))
    return { ok: false, error: `File too large. Max ${limitMb} MB for ${isVideo ? 'video' : 'photo'}.` }
  }

  return { ok: true, mediaType: isVideo ? 'video' : 'photo' }
}

export async function addBatchGroupMedia({ batchId, teacherId, file, batchIds }) {
  const validation = validateGroupMediaFile(file)
  if (!validation.ok) {
    return { ok: false, status: 415, error: validation.error }
  }

  if (!(await teacherOwnsBatch(teacherId, batchId, batchIds))) {
    return { ok: false, status: 403, error: 'You do not have access to this batch.' }
  }

  const uploadId = uuidv4()

  const gcsResult = await uploadToGCS(file.buffer, {
    folderParts: [batchId, BATCH_GROUP_PHOTO_SEGMENT],
    uploadId,
    mediaType: validation.mediaType,
    mimetype: file.mimetype,
  })

  const createdAt = new Date().toISOString()

  await BatchUpload.create({
    _id: uploadId,
    batch_id: batchId,
    teacher_id: teacherId,
    media_type: validation.mediaType,
    blob_url: gcsResult.publicUrl,
    blob_key: gcsResult.objectPath,
    file_path: gcsResult.objectPath,
    file_size_bytes: gcsResult.bytes ?? file.size,
    upload_source: 'web',
    status: UPLOAD_STATUS.DRAFT,
    created_at: createdAt,
    submitted_at: null,
  })

  const upload = await BatchUpload.findById(uploadId).lean()
  return { ok: true, status: 201, upload: mapBatchUploadRow(upload) }
}

export async function listBatchGroupMedia(batchId) {
  const rows = await BatchUpload.find({ batch_id: batchId })
    .sort({ created_at: -1 })
    .lean()
  return rows.map(mapBatchUploadRow)
}

export async function deleteBatchGroupMedia(uploadId, teacherId) {
  const row = await BatchUpload.findById(uploadId).lean()
  if (!row) return { ok: false, status: 404, error: 'Upload not found.' }
  if (row.teacher_id !== teacherId) {
    return { ok: false, status: 403, error: 'You do not have access to this upload.' }
  }

  if (row.blob_key) {
    await deleteFromGCS(row.blob_key)
  }

  await BatchUpload.deleteOne({ _id: uploadId })
  return { ok: true, status: 204 }
}
