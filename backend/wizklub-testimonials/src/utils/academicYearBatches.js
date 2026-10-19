/** Academic-year batch window (matches health-snapshot `{{FROM}}`). */
export const ACADEMIC_YEAR_BATCH_MIN_START = '2026-04-01'

export const ACADEMIC_YEAR_BATCH_SCOPE = {
  min_start_date: ACADEMIC_YEAR_BATCH_MIN_START,
  active_only: true,
  label: 'Active batches with start date on or after 1 April 2026',
}

const ACTIVE_BATCH_STATES = new Set(['ACTIVE', 'LIVE', 'RUNNING', 'ONGOING', 'IN_PROGRESS', 'OPEN'])

const INACTIVE_BATCH_HINTS = [
  'INACTIVE',
  'CLOSED',
  'COMPLETE',
  'COMPLETED',
  'CANCEL',
  'ARCHIVED',
  'ENDED',
  'DEACTIV',
  'SUSPEND',
  'TERMINAT',
]

export function batchLifecycleState(batch) {
  const raw =
    batch?.batch_state ??
    batch?.batchState ??
    batch?.status ??
    batch?.batch_status ??
    batch?.batchStatus ??
    ''
  return String(raw).trim().toUpperCase()
}

export function isActiveLifecycleState(state) {
  const s = String(state ?? '').trim().toUpperCase()
  if (!s) return true
  if (INACTIVE_BATCH_HINTS.some((hint) => s.includes(hint))) return false
  if (ACTIVE_BATCH_STATES.has(s)) return true
  if (ACTIVE_BATCH_STATES.some((token) => s.includes(token))) return true
  return false
}

/**
 * Active batches only. When a health snapshot map is provided, batches listed there must be active;
 * batches outside the snapshot may still pass if the list API marks them active (not inactive).
 */
export function isActiveBatch(batch, { healthBatchMap = null } = {}) {
  const id = String(batch?.id ?? batch?.batch_id ?? '')
  const apiState = batchLifecycleState(batch)

  if (healthBatchMap instanceof Map) {
    if (healthBatchMap.has(id)) {
      const meta = healthBatchMap.get(id)
      const healthState =
        meta && typeof meta === 'object' ? meta.batch_state ?? meta.state : null
      if (healthState != null && healthState !== '') {
        return isActiveLifecycleState(healthState)
      }
      return true
    }
    if (!apiState) return batchNameIndicatesAy2026(batch)
    return isActiveLifecycleState(apiState)
  }

  if (!apiState) return true
  return isActiveLifecycleState(apiState)
}

export function filterActiveBatches(batches, options = {}) {
  const list = Array.isArray(batches) ? batches : []
  return list.filter((b) => isActiveBatch(b, options))
}

function parseDateOnly(value) {
  if (value == null || value === '') return null
  const text = String(value).trim()
  const d = new Date(text.length === 10 ? `${text}T00:00:00` : text)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Prefer batch start date; fall back to created timestamp when API omits start_date. */
export function batchEffectiveStartDate(batch) {
  const raw =
    batch?.start_date ??
    batch?.startDate ??
    batch?.batch_start_date ??
    batch?.created_at ??
    batch?.createdAt ??
    null
  return parseDateOnly(raw)
}

export function isAcademicYearBatch(batch, minStart = ACADEMIC_YEAR_BATCH_MIN_START) {
  const start = batchEffectiveStartDate(batch)
  if (!start) return false
  const min = parseDateOnly(minStart)
  if (!min) return true
  return start >= min
}

/** When WizKlub omits dates, keep the batch (same as Analytics) rather than dropping all rows. */
export function isAcademicYearBatchLenient(batch, minStart = ACADEMIC_YEAR_BATCH_MIN_START) {
  const start = batchEffectiveStartDate(batch)
  if (!start) return true
  const min = parseDateOnly(minStart)
  if (!min) return true
  return start >= min
}

export function filterAcademicYearBatches(batches, minStart = ACADEMIC_YEAR_BATCH_MIN_START) {
  const list = Array.isArray(batches) ? batches : []
  return list.filter((b) => isAcademicYearBatchLenient(b, minStart))
}

export function filterBatchesByIdSet(batches, idSet) {
  if (!idSet?.size) return []
  const list = Array.isArray(batches) ? batches : []
  return list.filter((b) => idSet.has(String(b.id)))
}

/** Batch names from AY 2026 often include `_2026` when API omits start_date. */
export function batchNameIndicatesAy2026(batch) {
  const text = String(batch?.name ?? batch?.batch_name ?? batch?.id ?? '')
  return /_2026(?:_|$)/.test(text) || text.endsWith('_2026')
}

/**
 * Include batch when:
 * - listed in health snapshot for the school, OR
 * - start/created date is on or after 1 Apr 2026, OR
 * - (fallback) batch id/name clearly marks AY 2026 when health snapshot is unavailable.
 * Exclude older batches with known dates before the window.
 */
export function filterBatchesForAcademicYear(
  batches,
  { healthBatchIds = null, minStart = ACADEMIC_YEAR_BATCH_MIN_START } = {},
) {
  const list = Array.isArray(batches) ? batches : []
  const min = parseDateOnly(minStart)
  const healthSet =
    healthBatchIds instanceof Set
      ? healthBatchIds
      : healthBatchIds instanceof Map
        ? new Set(healthBatchIds.keys())
        : null
  const healthAvailable = Boolean(healthSet?.size)

  return list.filter((batch) => {
    const id = String(batch.id ?? batch.batch_id ?? '')
    if (healthSet?.has(id)) return true

    const start = batchEffectiveStartDate(batch)
    if (start && min) {
      if (start < min) return false
      return true
    }

    if (!healthAvailable && batchNameIndicatesAy2026(batch)) return true

    return false
  })
}
