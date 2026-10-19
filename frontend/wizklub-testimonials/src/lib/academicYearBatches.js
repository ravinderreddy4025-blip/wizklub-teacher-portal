export const ACADEMIC_YEAR_BATCH_MIN_START = '2026-04-01'

export const ACADEMIC_YEAR_BATCH_SCOPE_LABEL =
  'Active batches only · start date on or after 1 April 2026'

function parseDateOnly(value) {
  if (value == null || value === '') return null
  const text = String(value).trim()
  const d = new Date(text.length === 10 ? `${text}T00:00:00` : text)
  return Number.isNaN(d.getTime()) ? null : d
}

export function isAcademicYearBatch(batch, minStart = ACADEMIC_YEAR_BATCH_MIN_START) {
  const raw =
    batch?.start_date ??
    batch?.startDate ??
    batch?.batch_start_date ??
    batch?.created_at ??
    batch?.createdAt ??
    null
  const start = parseDateOnly(raw)
  if (!start) return false
  const min = parseDateOnly(minStart)
  return min ? start >= min : true
}

export function filterAcademicYearBatchIds(batchRows) {
  const rows = Array.isArray(batchRows) ? batchRows : []
  const allowed = new Set()
  for (const row of rows) {
    const id = row.batch_id ?? row.id
    if (!id) continue
    if (isAcademicYearBatch(row)) allowed.add(String(id))
  }
  return allowed
}
