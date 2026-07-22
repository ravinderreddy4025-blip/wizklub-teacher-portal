import { v4 as uuidv4 } from 'uuid'
import { Batch, Counter, Feedback, School } from '../db/models.js'
import { isDatabaseReady } from '../db/state.js'
import { uploadToGCS } from './storage.js'
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_FOLDER,
  FEEDBACK_PRIORITIES,
  FEEDBACK_STATUS,
  MAX_FEEDBACK_ATTACHMENTS,
} from '../utils/constants.js'

function mediaTypeFromMime(mimetype = '') {
  return mimetype.startsWith('video/') ? 'video' : 'image'
}

function mapFeedback(row) {
  if (!row) return null
  return {
    feedback_id: row.feedback_id,
    school_id: row.school_id,
    school_name: row.school_name,
    batch_id: row.batch_id,
    batch_name: row.batch_name,
    teacher_id: row.teacher_id,
    teacher_name: row.teacher_name,
    category: row.category,
    summary: row.summary,
    attachments: (row.attachments ?? []).map((a) => ({
      url: a.url,
      type: a.type,
      filename: a.filename,
      uploaded_at: a.uploaded_at,
    })),
    status: row.status,
    priority: row.priority ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    resolved_at: row.resolved_at ?? null,
    resolution_note: row.resolution_note ?? '',
  }
}

export async function nextFeedbackId() {
  const year = new Date().getFullYear()
  const counterId = `feedback_${year}`
  const counter = await Counter.findByIdAndUpdate(
    counterId,
    { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )
  const seq = String(counter.seq).padStart(4, '0')
  return `FB-${year}-${seq}`
}

async function resolveSchoolName(schoolId) {
  if (!schoolId || !isDatabaseReady()) return schoolId || ''
  const school = await School.findById(schoolId).lean()
  return school?.name || schoolId
}

async function resolveBatchName(batchId) {
  if (!batchId || !isDatabaseReady()) return batchId || ''
  const batch = await Batch.findById(batchId).lean()
  return batch?.name || batchId
}

async function uploadAttachments(feedbackId, files = []) {
  if (!files.length) return []
  if (files.length > MAX_FEEDBACK_ATTACHMENTS) {
    throw Object.assign(new Error(`Maximum ${MAX_FEEDBACK_ATTACHMENTS} attachments allowed.`), {
      status: 400,
    })
  }

  const attachments = []
  for (const file of files) {
    const mediaType = mediaTypeFromMime(file.mimetype)
    const uploadId = uuidv4()
    const safeName = (file.originalname || `attachment.${mediaType === 'video' ? 'mp4' : 'jpg'}`)
      .replace(/[^\w.\-()+ ]+/g, '_')
      .slice(0, 120)

    const gcs = await uploadToGCS(file.buffer, {
      folderParts: [FEEDBACK_FOLDER, feedbackId],
      uploadId,
      mediaType: mediaType === 'video' ? 'video' : 'photo',
      mimetype: file.mimetype,
    })

    attachments.push({
      url: gcs.publicUrl,
      type: mediaType,
      filename: safeName,
      uploaded_at: new Date(),
    })
  }

  return attachments
}

export async function createFeedback({
  teacherId,
  teacherName,
  schoolId,
  batchId,
  category,
  summary,
  priority,
  files = [],
}) {
  if (!isDatabaseReady()) {
    return { ok: false, status: 503, error: 'Database unavailable.' }
  }

  const trimmedSummary = String(summary ?? '').trim()
  if (!trimmedSummary) {
    return { ok: false, status: 400, error: 'Summary is required.' }
  }

  const normalizedSchoolId = String(schoolId ?? '').trim()
  const normalizedBatchId = String(batchId ?? '').trim()
  const normalizedCategory = FEEDBACK_CATEGORIES.includes(category) ? category : 'other'

  if (priority && !FEEDBACK_PRIORITIES.includes(priority)) {
    return { ok: false, status: 400, error: 'Invalid priority.' }
  }

  const feedbackId = await nextFeedbackId()
  const now = new Date()
  const [schoolName, batchName] = await Promise.all([
    normalizedSchoolId ? resolveSchoolName(normalizedSchoolId) : Promise.resolve(''),
    normalizedBatchId ? resolveBatchName(normalizedBatchId) : Promise.resolve(''),
  ])

  let attachments = []
  let attachmentWarning = null
  if (files.length > 0) {
    try {
      attachments = await uploadAttachments(feedbackId, files)
    } catch (err) {
      if (err.status === 400) {
        return { ok: false, status: 400, error: err.message }
      }
      console.error('Feedback attachment upload failed (saving without files):', err.message)
      attachmentWarning = 'Feedback saved, but attachments failed to upload.'
      attachments = []
    }
  }

  const doc = await Feedback.create({
    feedback_id: feedbackId,
    school_id: normalizedSchoolId,
    school_name: schoolName,
    batch_id: normalizedBatchId,
    batch_name: batchName,
    teacher_id: teacherId,
    teacher_name: teacherName || teacherId,
    category: normalizedCategory,
    summary: trimmedSummary,
    attachments,
    status: FEEDBACK_STATUS.OPEN,
    priority: priority || undefined,
    created_at: now,
    updated_at: now,
    resolved_at: null,
    resolution_note: '',
  })

  return {
    ok: true,
    status: 201,
    feedback: mapFeedback(doc.toObject()),
    warning: attachmentWarning,
  }
}

export async function listFeedback({
  teacherId,
  schoolId,
  batchId,
  status,
  page = 1,
  limit = 20,
}) {
  if (!isDatabaseReady()) {
    return { ok: true, items: [], page: 1, limit: 20, total: 0, total_pages: 0 }
  }

  const safePage = Math.max(1, Number(page) || 1)
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20))
  const filter = { teacher_id: teacherId }

  if (schoolId) filter.school_id = schoolId
  if (batchId) filter.batch_id = batchId
  if (status) filter.status = status

  const [total, rows] = await Promise.all([
    Feedback.countDocuments(filter),
    Feedback.find(filter)
      .sort({ created_at: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .lean(),
  ])

  return {
    ok: true,
    items: rows.map(mapFeedback),
    page: safePage,
    limit: safeLimit,
    total,
    total_pages: Math.ceil(total / safeLimit) || 0,
  }
}

export async function getFeedback(feedbackId, teacherId) {
  if (!isDatabaseReady()) {
    return { ok: false, status: 503, error: 'Database unavailable.' }
  }

  const row = await Feedback.findOne({ feedback_id: feedbackId, teacher_id: teacherId }).lean()
  if (!row) {
    return { ok: false, status: 404, error: 'Feedback not found.' }
  }

  return { ok: true, feedback: mapFeedback(row) }
}

export async function updateFeedback(feedbackId, teacherId, { status, resolution_note, priority }) {
  if (!isDatabaseReady()) {
    return { ok: false, status: 503, error: 'Database unavailable.' }
  }

  const row = await Feedback.findOne({ feedback_id: feedbackId, teacher_id: teacherId })
  if (!row) {
    return { ok: false, status: 404, error: 'Feedback not found.' }
  }

  const now = new Date()
  let changed = false

  if (status) {
    if (!Object.values(FEEDBACK_STATUS).includes(status)) {
      return { ok: false, status: 400, error: 'Invalid status.' }
    }
    row.status = status
    if (status === FEEDBACK_STATUS.RESOLVED) {
      row.resolved_at = now
    } else if (row.resolved_at) {
      row.resolved_at = null
    }
    changed = true
  }

  if (resolution_note !== undefined) {
    row.resolution_note = String(resolution_note ?? '').trim()
    changed = true
  }

  if (priority !== undefined) {
    if (priority === null || priority === '') {
      row.priority = null
      changed = true
    } else if (FEEDBACK_PRIORITIES.includes(priority)) {
      row.priority = priority
      changed = true
    } else {
      return { ok: false, status: 400, error: 'Invalid priority.' }
    }
  }

  if (!changed) {
    return { ok: false, status: 400, error: 'No valid fields to update.' }
  }

  row.updated_at = now
  await row.save()

  return { ok: true, feedback: mapFeedback(row.toObject()) }
}
