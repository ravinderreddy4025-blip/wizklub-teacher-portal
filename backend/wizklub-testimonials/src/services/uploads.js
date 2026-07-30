import { v4 as uuidv4 } from 'uuid'
import {
  ALLOWED_MIME_TYPES,
  CATEGORIES_TOTAL,
  MAX_PHOTO_BYTES,
  MAX_VIDEO_BYTES,
  REVIEW_CATEGORIES,
  UPLOAD_STATUS,
} from '../utils/constants.js'
import { Upload } from '../db/models.js'
import { uploadToGCS, deleteFromGCS } from './storage.js'
import { getUploadById, mapUploadRow } from './access.js'

export function validateUploadFile(file) {
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

function sortByNewest(rows, field = 'created_at') {
  return [...rows].sort((a, b) => new Date(b[field]) - new Date(a[field]))
}

export function getStudentCompletion(uploads, studentId) {
  const studentUploads = uploads.filter((upload) => upload.student_id === studentId)

  const categories = REVIEW_CATEGORIES.map((category) => {
    const categoryUploads = studentUploads.filter((upload) => upload.category === category)
    const drafts = sortByNewest(categoryUploads.filter((upload) => upload.status === UPLOAD_STATUS.DRAFT))
    const submitted = sortByNewest(
      categoryUploads.filter((upload) => upload.status === UPLOAD_STATUS.SUBMITTED),
      'submitted_at',
    )

    return {
      category,
      complete: submitted.length > 0,
      drafts,
      submitted,
    }
  })

  const categoriesDone = categories.filter((row) => row.complete).length
  const completionPct = Math.round((categoriesDone / CATEGORIES_TOTAL) * 100)

  return {
    categories_done: categoriesDone,
    categories_total: CATEGORIES_TOTAL,
    completion_pct: completionPct,
    status: completionPct === 100 ? 'uploaded' : 'pending',
    categories,
  }
}

export function getBatchHealthTag(completionAvg) {
  if (completionAvg >= 50) return 'actively_uploading'
  if (completionAvg >= 25) return 'in_progress'
  return 'need_to_grow'
}

export function getBatchCompletion(uploads, studentIds) {
  if (studentIds.length === 0) {
    return { completion_avg: 0, health_tag: 'need_to_grow' }
  }

  const studentPcts = studentIds.map(
    (studentId) => getStudentCompletion(uploads, studentId).completion_pct,
  )
  const completionAvg = Math.round(
    studentPcts.reduce((sum, pct) => sum + pct, 0) / studentPcts.length,
  )

  return {
    completion_avg: completionAvg,
    health_tag: getBatchHealthTag(completionAvg),
  }
}

export async function createUpload({ studentId, teacherId, category, file }) {
  const validation = validateUploadFile(file)
  if (!validation.ok) {
    return { ok: false, status: 415, error: validation.error }
  }

  if (!REVIEW_CATEGORIES.includes(category)) {
    return { ok: false, status: 400, error: 'Invalid review category.' }
  }

  const uploadId = uuidv4()

  const gcsResult = await uploadToGCS(file.buffer, {
    folderParts: [studentId, category],
    uploadId,
    mediaType: validation.mediaType,
    mimetype: file.mimetype,
  })

  const createdAt = new Date().toISOString()

  await Upload.create({
    _id: uploadId,
    student_id: studentId,
    teacher_id: teacherId,
    category,
    media_type: validation.mediaType,
    blob_url: gcsResult.publicUrl,
    blob_key: gcsResult.objectPath,
    file_path: gcsResult.objectPath,
    file_size_bytes: gcsResult.bytes ?? file.size,
    duration_seconds: null,
    upload_source: 'web',
    status: UPLOAD_STATUS.DRAFT,
    created_at: createdAt,
    submitted_at: null,
  })

  const upload = await getUploadById(uploadId)
  return { ok: true, status: 201, upload }
}

export async function deleteUpload(uploadId, teacherId) {
  const upload = await getUploadById(uploadId)
  if (!upload) return { ok: false, status: 404, error: 'Upload not found.' }
  if (upload.teacher_id !== teacherId) {
    return { ok: false, status: 403, error: 'You do not have access to this upload.' }
  }
  if (upload.status === UPLOAD_STATUS.SUBMITTED) {
    return { ok: false, status: 403, error: 'Submitted media cannot be removed.' }
  }

  if (upload.blob_key) {
    await deleteFromGCS(upload.blob_key)
  }

  await Upload.deleteOne({ _id: uploadId })
  return { ok: true, status: 204 }
}

export async function submitCategory(studentId, category, teacherId) {
  if (!REVIEW_CATEGORIES.includes(category)) {
    return { ok: false, status: 400, error: 'Invalid review category.' }
  }

  const drafts = await Upload.find({
    student_id: studentId,
    category,
    status: UPLOAD_STATUS.DRAFT,
  }).lean()

  if (drafts.length === 0) {
    return { ok: false, status: 400, error: 'Add at least one photo or video before submitting.' }
  }

  const submittedAt = new Date().toISOString()
  await Upload.updateMany(
    { student_id: studentId, category, status: UPLOAD_STATUS.DRAFT },
    { $set: { status: UPLOAD_STATUS.SUBMITTED, submitted_at: submittedAt } },
  )

  return {
    ok: true,
    status: 200,
    submitted_count: drafts.length,
    submitted_at: submittedAt,
  }
}
