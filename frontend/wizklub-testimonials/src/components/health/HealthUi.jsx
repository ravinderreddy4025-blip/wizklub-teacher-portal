import { Activity } from 'lucide-react'
import { BAND_META, BANDS, bandOf, initials } from '../../lib/health'

/** RAG pill — colours per HEALTH_CONTRACT (G/A/R/N). Text always spells the band out. */
export function BandPill({ band, children, size = 'md', title }) {
  const b = bandOf(band)
  return (
    <span className={`hband hband--${b} hband--${size}`} title={title}>
      <span className="hband__dot" aria-hidden />
      {children ?? BAND_META[b].label}
    </span>
  )
}

/**
 * Stacked G/A/R/N bar. Each segment (and its legend entry) is a button that filters the roster.
 * `extra` lets a caller annotate a band (e.g. "incl. 3 not started" on Red).
 */
export function BandBar({ title, counts, activeBand, onSelect, extra = {}, caption }) {
  const total = BANDS.reduce((sum, b) => sum + (Number(counts?.[b]) || 0), 0)
  return (
    <div className="hbar">
      <div className="hbar__head">
        <h3 className="hbar__title">{title}</h3>
        {caption && <span className="hbar__caption">{caption}</span>}
      </div>
      <div className="hbar__track" role="group" aria-label={`${title} by band`}>
        {total === 0 ? (
          <span className="hbar__empty">No students yet</span>
        ) : (
          BANDS.map((b) => {
            const n = Number(counts?.[b]) || 0
            if (!n) return null
            return (
              <button
                key={b}
                type="button"
                className={`hbar__seg hbar__seg--${b} ${activeBand === b ? 'is-active' : ''}`}
                style={{ flexGrow: n }}
                onClick={() => onSelect?.(b)}
                aria-pressed={activeBand === b}
                aria-label={`${BAND_META[b].label}: ${n} students — show them`}
              >
                <span>{n}</span>
              </button>
            )
          })
        )}
      </div>
      <div className="hbar__legend">
        {BANDS.map((b) => {
          const n = Number(counts?.[b]) || 0
          return (
            <button
              key={b}
              type="button"
              className={`hbar__key ${activeBand === b ? 'is-active' : ''}`}
              onClick={() => onSelect?.(b)}
              disabled={!n}
            >
              <span className={`hbar__swatch hbar__swatch--${b}`} aria-hidden />
              {BAND_META[b].label} <strong>{n}</strong>
              {extra[b] ? <span className="hbar__extra">{extra[b]}</span> : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function HealthAvatar({ name, size = 40 }) {
  return (
    <span className="havatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }} aria-hidden>
      {initials(name)}
    </span>
  )
}

export function HealthEmpty({ title, text, action }) {
  return (
    <div className="dash-empty health-empty">
      <Activity size={32} aria-hidden />
      <p className="dash-empty__title">{title}</p>
      {text && <p className="dash-empty__text">{text}</p>}
      {action}
    </div>
  )
}

export function HealthSkeleton({ rows = 5 }) {
  return (
    <div className="health-page" aria-busy="true" aria-label="Loading health report">
      <div className="skeleton skeleton--title" />
      <div className="dash-kpis">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton skeleton--kpi" />
        ))}
      </div>
      <div className="skeleton" style={{ height: 150 }} />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" style={{ height: 52 }} />
      ))}
    </div>
  )
}
