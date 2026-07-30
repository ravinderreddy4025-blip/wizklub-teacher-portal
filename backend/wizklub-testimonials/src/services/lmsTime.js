import { config } from '../config.js'

/**
 * Fetch LMS active-time directly from LMS using service API key auth.
 */
function isLmsConfigured() {
  return Boolean(config.lms.baseUrl && config.lms.apiKey && config.lms.apiSecret)
}

function authHeader() {
  return `token ${config.lms.apiKey}:${config.lms.apiSecret}`
}

function minutesFromSummaryCards(summary) {
  const cards = Array.isArray(summary?.summary_cards) ? summary.summary_cards : []
  const totalCard = cards.find((c) => c?.key === 'total')
  if (totalCard && totalCard.minutes != null) {
    return Number(totalCard.minutes) || 0
  }
  return cards.reduce((sum, card) => sum + (Number(card?.minutes) || 0), 0)
}

function weeklyBarsFromHeatmap(heatmap, weekCount = 4) {
  const days = Array.isArray(heatmap) ? heatmap : []
  const withMinutes = days
    .filter((d) => d && d.date && !d.is_future)
    .map((d) => ({ date: d.date, minutes: Number(d.minutes) || 0 }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))

  if (withMinutes.length === 0) {
    return Array.from({ length: weekCount }, () => 0)
  }

  const recent = withMinutes.slice(-(weekCount * 7))
  while (recent.length < weekCount * 7) {
    recent.unshift({ date: '', minutes: 0 })
  }

  const bars = []
  for (let w = 0; w < weekCount; w += 1) {
    const slice = recent.slice(w * 7, w * 7 + 7)
    bars.push(slice.reduce((sum, d) => sum + d.minutes, 0))
  }
  return bars
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

export async function fetchTeacherLmsTime(userId) {
  if (!isLmsConfigured()) {
    return {
      configured: false,
      hours: 0,
      minutes: 0,
      period_days: 14,
      display: '0h',
      weekly_bars: [0, 0, 0, 0],
      label: 'Your LMS time (14 days)',
      user_id: userId || '',
    }
  }

  if (!userId) {
    throw Object.assign(new Error('Teacher LMS email is required for LMS time.'), { status: 400 })
  }

  const summary = await lmsGet(
    `/api/method/lms.tracking.get_user_summary?user_id=${encodeURIComponent(userId)}`,
  )
  const minutes = minutesFromSummaryCards(summary)
  const hours = Math.round((minutes / 60) * 10) / 10
  const periodDays = Number(summary?.summary_period_days) || 14

  let weeklyBars = [0, 0, 0, 0]
  try {
    const year = new Date().getFullYear()
    const heatmapPayload = await lmsGet(
      `/api/method/lms.tracking.get_heatmap?user_id=${encodeURIComponent(userId)}&year=${year}`,
    )
    weeklyBars = weeklyBarsFromHeatmap(heatmapPayload?.heatmap, 4)
  } catch {
    // Summary is enough for the card; keep zero bars if heatmap fails.
  }

  const totalCard = Array.isArray(summary?.summary_cards)
    ? summary.summary_cards.find((c) => c?.key === 'total')
    : null
  return {
    configured: true,
    hours,
    minutes,
    period_days: periodDays,
    display: totalCard?.display || `${hours}h`,
    weekly_bars: weeklyBars,
    label: `Your LMS time (${periodDays} days)`,
    user_id: userId,
  }
}
