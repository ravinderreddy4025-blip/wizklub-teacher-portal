import { CATEGORIES_TOTAL, HEALTH_TAGS, REVIEW_CATEGORIES } from '../api/constants'

function sortByNewest(rows, field = 'created_at') {
  return [...rows].sort((a, b) => new Date(b[field]) - new Date(a[field]))
}

export function getCategoryUploads(uploads, studentId, category) {
  return uploads.filter((upload) => upload.student_id === studentId && upload.category === category)
}

export function getDraftUploads(uploads, studentId, category) {
  return sortByNewest(
    getCategoryUploads(uploads, studentId, category).filter((upload) => upload.status === 'draft'),
  )
}

export function getSubmittedUploads(uploads, studentId, category) {
  return sortByNewest(
    getCategoryUploads(uploads, studentId, category).filter((upload) => upload.status === 'submitted'),
    'submitted_at',
  )
}

export function isCategoryComplete(uploads, studentId, category) {
  return getSubmittedUploads(uploads, studentId, category).length > 0
}

export function getStudentCompletion(uploads, studentId) {
  const categories = REVIEW_CATEGORIES.map((category) => {
    const drafts = getDraftUploads(uploads, studentId, category)
    const submitted = getSubmittedUploads(uploads, studentId, category)

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
  if (completionAvg >= 50) return HEALTH_TAGS.ACTIVELY_UPLOADING
  if (completionAvg >= 25) return HEALTH_TAGS.IN_PROGRESS
  return HEALTH_TAGS.NEED_TO_GROW
}

export function getBatchCompletion(uploads, studentIds) {
  if (studentIds.length === 0) {
    return { completion_avg: 0, health_tag: HEALTH_TAGS.NEED_TO_GROW }
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
