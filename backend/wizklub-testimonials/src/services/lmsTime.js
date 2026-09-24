import { config } from '../config.js'

/**
 * Fetch LMS active-time directly from LMS using service API key auth.
 * Card shows year-to-date total + current-month weekly series from heatmap.
 */
function isLmsConfigured() {
  return Boolean(config.lms.baseUrl && config.lms.apiKey && config.lms.apiSecret)
}

function authHeader() {
  return `token ${config.lms.apiKey}:${config.lms.apiSecret}`
}

function toDateKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatDuration(totalMinutes) {
  const minutes = Math.max(0, Math.round(Number(totalMinutes) || 0))
  const hours = Math.floor(minutes / 60)
  const rem = minutes % 60
  if (hours === 0) return `${rem}m`
  if (rem === 0) return `${hours}h`
  return `${hours}h ${rem}m`
}

function formatWeekLabel(start, end) {
  const startLabel = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const sameMonth = start.getMonth() === end.getMonth()
  const endLabel = sameMonth
    ? String(end.getDate())
    : end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${startLabel}–${endLabel}`
}

function heatmapByDate(heatmap) {
  const map = new Map()
  for (const day of Array.isArray(heatmap) ? heatmap : []) {
    if (!day?.date || day.is_future) continue
    map.set(String(day.date).slice(0, 10), Number(day.minutes) || 0)
  }
  return map
}

function yearMinutesFromHeatmap(heatmap) {
  let total = 0
  for (const minutes of heatmapByDate(heatmap).values()) {
    total += minutes
  }
  return total
}

/**
 * Monday–Sunday weeks that overlap the current calendar month (through today).
 * Minutes counted only for days inside the month up to today.
 */
function monthWeekSeries(heatmap, now = new Date()) {
  const year = now.getFullYear()
  const month = now.getMonth()
  const monthStart = new Date(year, month, 1)
  const monthEnd = new Date(year, month + 1, 0)
  const today = new Date(year, month, now.getDate())
  const rangeEnd = today < monthEnd ? today : monthEnd
  const minutesByDate = heatmapByDate(heatmap)

  const cursor = new Date(monthStart)
  const weekday = cursor.getDay()
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday
  cursor.setDate(cursor.getDate() + mondayOffset)

  const points = []
  while (cursor <= rangeEnd) {
    const weekStart = new Date(cursor)
    const weekEnd = new Date(cursor)
    weekEnd.setDate(weekEnd.getDate() + 6)

    if (weekEnd >= monthStart && weekStart <= rangeEnd) {
      let minutes = 0
      for (let i = 0; i < 7; i += 1) {
        const day = new Date(weekStart)
        day.setDate(weekStart.getDate() + i)
        if (day < monthStart || day > rangeEnd) continue
        minutes += minutesByDate.get(toDateKey(day)) || 0
      }
      points.push({
        label: formatWeekLabel(weekStart, weekEnd),
        start: toDateKey(weekStart),
        end: toDateKey(weekEnd),
        minutes,
      })
    }

    cursor.setDate(cursor.getDate() + 7)
  }

  return points
}

async function lmsGet(pathWithQuery) {
  const response = await fetch(`${config.lms.baseUrl}${pathWithQuery}`, {
    headers: {
      accept: 'application/json',
      Authorization: authHeader(),
    },
  })
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    const message = payload?.message || payload?.error || payload?.exc || `LMS time failed (${response.status})`
    const err = new Error(message)
    err.status = response.status
    throw err
  }

  return payload?.message ?? payload
}

function emptyPayload(userId = '') {
  const year = new Date().getFullYear()
  return {
    configured: false,
    year,
    hours: 0,
    minutes: 0,
    display: '0m',
    label: `Active in ${year}`,
    month_points: [],
    chart_hint: 'Each point is a week in the current month',
    user_id: userId || '',
  }
}

export async function fetchTeacherLmsTime(userId) {
  if (!isLmsConfigured()) {
    return emptyPayload(userId)
  }

  if (!userId) {
    throw Object.assign(new Error('Teacher LMS email is required for LMS time.'), { status: 400 })
  }

  const year = new Date().getFullYear()
  const heatmapPayload = await lmsGet(
    `/api/method/lms.tracking.get_heatmap?user_id=${encodeURIComponent(userId)}&year=${year}`,
  )
  const heatmap = heatmapPayload?.heatmap || []
  const minutes = yearMinutesFromHeatmap(heatmap)
  const hours = Math.round((minutes / 60) * 10) / 10
  const monthPoints = monthWeekSeries(heatmap)

  return {
    configured: true,
    year,
    hours,
    minutes,
    display: formatDuration(minutes),
    label: `Active in ${year}`,
    month_points: monthPoints,
    chart_hint: 'Each point is a week in the current month',
    user_id: userId,
  }
}
