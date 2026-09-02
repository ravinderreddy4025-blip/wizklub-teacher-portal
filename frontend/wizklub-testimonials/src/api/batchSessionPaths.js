/**
 * wizklub_api batch-scoped session / conduct / submit paths.
 * Base URL is host-only (no /v1 suffix) — paths include /v1/... .
 */

function batchBase(batchId) {
  return `/v1/batches/${encodeURIComponent(batchId)}`
}

function sessionBase(batchId, sessionId) {
  return `${batchBase(batchId)}/sessions/${encodeURIComponent(sessionId)}`
}

export function batchAssessmentSessionsPath(batchId) {
  return `${batchBase(batchId)}/sessions?type=assessment`
}

export function batchSessionConductPath(batchId, sessionId) {
  return `${sessionBase(batchId, sessionId)}/conduct`
}

export function batchSessionLevelMediaPath(batchId, sessionId, levelId) {
  return `${sessionBase(batchId, sessionId)}/levels/${encodeURIComponent(levelId)}/media`
}

export function batchSessionLevelResponsesPath(batchId, sessionId, levelId) {
  return `${sessionBase(batchId, sessionId)}/levels/${encodeURIComponent(levelId)}/responses`
}

export function batchSessionSubmitPath(batchId, sessionId) {
  return `${sessionBase(batchId, sessionId)}/submit`
}
