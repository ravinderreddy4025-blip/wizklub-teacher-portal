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
}) {
  const finishLabel = submitting
    ? 'Submitting…'
    : pendingCount > 0
      ? `Submit Assessment (${pendingCount})`
      : 'Submit Assessment'

  return (
    <div className="conduct-bottom-bar">
      <button
        type="button"
        className="btn-outline conduct-bottom-bar__btn"
        onClick={onPrevious}
        disabled={disableNav || !canGoPrevious}
      >
        Previous
      </button>
      <button
        type="button"
        className="btn-primary conduct-bottom-bar__btn conduct-bottom-bar__btn--scan"
        onClick={onScan}
        disabled={submitting}
      >
        Scan SR Codes
      </button>
      <button
        type="button"
        className="btn-outline conduct-bottom-bar__btn"
        onClick={onNext}
        disabled={disableNav || !canGoNext}
      >
        Next
      </button>
      <button
        type="button"
        className="btn-outline conduct-bottom-bar__btn conduct-bottom-bar__btn--finish"
        onClick={onFinish}
        disabled={submitting}
        aria-busy={submitting}
      >
        {finishLabel}
      </button>
    </div>
  )
}
