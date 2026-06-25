/** Shared domain constants — same contract for web PWA and future native/webview. */

export const REVIEW_CATEGORIES = [
  'ptm',
  'principal_review',
  'parent_review',
  'teacher_review',
  'student_review',
]

export const REVIEW_CATEGORY_LABELS = {
  ptm: 'PTM',
  principal_review: 'Principal review',
  parent_review: 'Parent review',
  teacher_review: 'Teacher review',
  student_review: 'Student review',
}

export const CATEGORIES_TOTAL = REVIEW_CATEGORIES.length

export const HEALTH_TAGS = {
  ACTIVELY_UPLOADING: 'actively_uploading',
  IN_PROGRESS: 'in_progress',
  NEED_TO_GROW: 'need_to_grow',
}

export const HEALTH_TAG_LABELS = {
  actively_uploading: 'Actively uploading',
  in_progress: 'In progress',
  need_to_grow: 'Need to grow',
}

export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/gif',
  'image/tiff',
  'video/mp4',
  'video/quicktime',
  'video/3gpp',
  'video/x-matroska',
  'video/webm',
  'video/x-msvideo',
  'video/x-m4v',
]

export const MAX_PHOTO_BYTES = 25 * 1024 * 1024
export const MAX_VIDEO_BYTES = 500 * 1024 * 1024

export const UPLOAD_STATUS = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
}

export const BATCH_GROUP_PHOTO_LABEL = 'Class group photo / video'
