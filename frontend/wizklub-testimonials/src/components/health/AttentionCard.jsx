import { useEffect, useState } from 'react'
import { ArrowRight, HeartPulse } from 'lucide-react'
import { api } from '../../api/client'
import { batchHealthPath, formatDate } from '../../lib/health'
import { useNavigate } from '../../router'
import { BandPill } from './HealthUi'
import '../../pages/health.css'

const TONES = ['orange', 'blue', 'purple', 'green', 'gold']
const PREVIEW = 4

/**
 * Dashboard "Students needing attention" — per batch: Red, not started, pending assessment.
 * Every number opens the batch health roster pre-filtered to those students.
 */
export default function AttentionCard() {
  const navigate = useNavigate()
  const [state, setState] = useState({ status: 'loading' })
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    let alive = true
    api.getHealthAttention().then((result) => {
      if (!alive) return
      setState(result ? { status: 'ready', data: result } : { status: 'error' })
    })
    return () => {
      alive = false
    }
  }, [])

  const data = state.data
  const batches = data?.batches ?? []
  // Already sorted by Red, then not started (server side); teachers with many batches see the worst first.
  const visible = showAll ? batches : batches.slice(0, PREVIEW)
  const totalRed = batches.reduce((sum, b) => sum + (b.red || 0), 0)
  const open = (b, filter) => navigate(batchHealthPath(b.batch_id, b.school_id, filter))

  return (
    <section className="dash-section" aria-labelledby="dash-attention">
      <div className="section-header">
        <div>
          <h2 id="dash-attention" className="section-title">Students needing attention</h2>
          {data?.run && (
            <p className="hatt-asof">
              {totalRed
                ? `${totalRed} student${totalRed === 1 ? '' : 's'} in Red across ${batches.length} batch${batches.length === 1 ? '' : 'es'}`
                : 'No students in Red'}{' '}
              · data as of {formatDate(data.run.data_as_of, { withYear: true })}
            </p>
          )}
        </div>
      </div>

      {state.status === 'loading' ? (
        <div className="hatt" aria-busy="true" aria-label="Loading students needing attention">
          <div className="skeleton" style={{ height: 92 }} />
          <div className="skeleton" style={{ height: 92 }} />
        </div>
      ) : state.status === 'error' ? (
        <div className="dash-empty">
          <HeartPulse size={28} aria-hidden />
          <p className="dash-empty__title">Couldn’t load student health</p>
          <p className="dash-empty__text">The rest of your dashboard still works — try again later.</p>
        </div>
      ) : !data.run ? (
        <div className="dash-empty">
          <HeartPulse size={28} aria-hidden />
          <p className="dash-empty__title">Health data not available yet</p>
          <p className="dash-empty__text">Student health appears here after the first nightly snapshot.</p>
        </div>
      ) : batches.length === 0 ? (
        <div className="dash-empty">
          <HeartPulse size={28} aria-hidden />
          <p className="dash-empty__title">None of your batches are in the snapshot yet</p>
          <p className="dash-empty__text">Batches that started this academic year appear after the next nightly run.</p>
        </div>
      ) : (
        <div className="hatt">
          {visible.map((b, i) => (
            <article key={b.batch_id} className="hatt-row">
              <div className="hatt-row__id">
                <span className={`hatt-row__art tone-${TONES[i % TONES.length]}`} aria-hidden>
                  <HeartPulse size={22} strokeWidth={1.8} />
                </span>
                <span className="hatt-row__body">
                  <span className="hatt-row__name">{b.batch_name}</span>
                  <span className="hatt-row__meta">
                    {b.school_name} · {b.students} students
                  </span>
                </span>
                {b.overall_band && <BandPill band={b.overall_band} size="sm" />}
              </div>
              <div className="hatt-row__stats">
                <button type="button" className="hatt-stat hatt-stat--R" disabled={!b.red} onClick={() => open(b, 'overall:R')}>
                  <span className="hatt-stat__n">{b.red}</span>
                  <span className="hatt-stat__label">In Red</span>
                </button>
                <button
                  type="button"
                  className="hatt-stat hatt-stat--R"
                  disabled={!b.not_started}
                  onClick={() => open(b, 'participation:not_started')}
                >
                  <span className="hatt-stat__n">{b.not_started}</span>
                  <span className="hatt-stat__label">Not started</span>
                </button>
                <button
                  type="button"
                  className="hatt-stat hatt-stat--A"
                  disabled={!b.pending_assessment}
                  onClick={() => open(b, 'pending_assessment')}
                >
                  <span className="hatt-stat__n">{b.pending_assessment}</span>
                  <span className="hatt-stat__label">Pending assessment</span>
                </button>
              </div>
              <button type="button" className="hatt-row__go" onClick={() => open(b)}>
                Open health <ArrowRight size={16} aria-hidden />
              </button>
            </article>
          ))}
          {batches.length > PREVIEW && (
            <button type="button" className="btn-outline hatt-more" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Show fewer batches' : `Show all ${batches.length} batches`}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
