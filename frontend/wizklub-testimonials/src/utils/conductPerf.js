/**
 * Conduct-page performance instrumentation (DevTools Performance + console).
 * Enable with ?conductPerf=1 or localStorage.conductPerf = '1'.
 */

const LOG_PREFIX = '[conduct-perf]'

export function isConductPerfEnabled() {
  if (typeof window === 'undefined') return false
  try {
    if (window.localStorage?.getItem('conductPerf') === '1') return true
    if (new URLSearchParams(window.location.search).get('conductPerf') === '1') return true
  } catch {
    // ignore
  }
  return false
}

export function logConductPerf(...args) {
  if (!isConductPerfEnabled()) return
  // eslint-disable-next-line no-console
  console.info(LOG_PREFIX, ...args)
}

/** Track long tasks and correlate with active Performance measure names. */
export function installConductLongTaskObserver() {
  if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') {
    return () => {}
  }
  if (!isConductPerfEnabled()) return () => {}

  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const activeMeasures = performance
        .getEntriesByType('measure')
        .filter((m) => {
          const start = m.startTime
          const end = start + m.duration
          return entry.startTime >= start && entry.startTime <= end
        })
        .map((m) => m.name)
      logConductPerf('long-task', {
        durationMs: Math.round(entry.duration),
        startMs: Math.round(entry.startTime),
        duringMeasures: activeMeasures,
      })
    }
  })

  try {
    observer.observe({ type: 'longtask', buffered: true })
  } catch {
    // longtask not supported
  }

  return () => observer.disconnect()
}

/** React.Profiler onRender → console + performance marks. */
export function onConductProfilerRender(
  id,
  phase,
  actualDuration,
  baseDuration,
  startTime,
  commitTime,
) {
  if (!isConductPerfEnabled()) return
  logConductPerf('react-profiler', {
    id,
    phase,
    actualDurationMs: Math.round(actualDuration * 100) / 100,
    baseDurationMs: Math.round(baseDuration * 100) / 100,
    startTime: Math.round(startTime),
    commitTime: Math.round(commitTime),
  })
  try {
    performance.measure(`react:${id}:${phase}`, {
      start: startTime,
      duration: actualDuration,
    })
  } catch {
    // ignore
  }
}

const renderCounts = new Map()

export function bumpRenderCount(componentName) {
  if (!isConductPerfEnabled()) return
  const next = (renderCounts.get(componentName) || 0) + 1
  renderCounts.set(componentName, next)
  logConductPerf('render', componentName, next)
}

export function resetRenderCounts() {
  renderCounts.clear()
}

/** Count matching network requests (fetch monkey-patch, opt-in). */
export function installMediaRequestCounter() {
  if (typeof window === 'undefined' || !isConductPerfEnabled()) return () => {}
  if (window.__conductMediaFetchPatched) return () => {}

  const original = window.fetch.bind(window)
  const counts = { media: 0, conduct: 0, other: 0 }
  window.__conductMediaFetchCounts = counts
  window.__conductMediaFetchPatched = true

  window.fetch = async (input, init) => {
    const url = String(typeof input === 'string' ? input : input?.url || '')
    if (url.includes('/levels/') && url.includes('/media')) {
      counts.media += 1
      logConductPerf('fetch /media', counts.media, url)
    } else if (url.includes('/conduct')) {
      counts.conduct += 1
      logConductPerf('fetch /conduct', counts.conduct, url)
    } else {
      counts.other += 1
    }
    return original(input, init)
  }

  return () => {
    window.fetch = original
    window.__conductMediaFetchPatched = false
  }
}
