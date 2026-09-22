import { ArrowLeft, ArrowRight, Check, ScanLine } from 'lucide-react'

/*
 * Sticky action bar. Design-system rule: exactly ONE primary button per view —
 * "Scan SR codes" while questions remain; on the last question "Submit assessment" becomes primary
 * and scanning drops to secondary.
 */
export default function BottomNavigation({
  canGoPrevious,
  canGoNext,
  onPrevious,
  onNext,
  onScan,
  onFinish,
  disableNav,
  submitting = false,
  pendingCount = 0,
  showSubmit = false,
}) {
  const finishLabel = submitting
    ? 'Submitting…'
    : pendingCount > 0
      ? `Submit assessment (${pendingCount})`
      : 'Submit assessment'

  return (
    <div className={`ac-bar-actions${showSubmit ? ' ac-bar-actions--submit' : ''}`}>
      <button
        type="button"
        className="ac-btn ac-btn--secondary ac-btn--prev"
        onClick={onPrevious}
        disabled={disableNav || !canGoPrevious}
      >
        <ArrowLeft size={20} strokeWidth={2.4} aria-hidden="true" />
        <span>Previous</span>
      </button>

      <button
        type="button"
        className={`ac-btn ac-btn--scan ${showSubmit ? 'ac-btn--secondary' : 'ac-btn--primary'}`}
        onClick={onScan}
        disabled={submitting}
      >
        <span className="ac-btn__icon"><ScanLine size={18} strokeWidth={2.4} aria-hidden="true" /></span>
        <span>Scan SR codes</span>
      </button>

      {showSubmit ? (
        <button
          type="button"
          className="ac-btn ac-btn--primary ac-btn--finish"
          onClick={onFinish}
          disabled={submitting}
          aria-busy={submitting}
        >
          <span className="ac-btn__icon"><Check size={18} strokeWidth={2.6} aria-hidden="true" /></span>
          <span>{finishLabel}</span>
        </button>
      ) : (
        <button
          type="button"
          className="ac-btn ac-btn--secondary ac-btn--next"
          onClick={onNext}
          disabled={disableNav || !canGoNext}
        >
          <span>Next</span>
          <ArrowRight size={20} strokeWidth={2.4} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
