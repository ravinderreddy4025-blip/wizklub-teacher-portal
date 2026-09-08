import { useScanner } from '../../hooks/useScanner'

export default function AssessmentScanner({ studentLookup, questionId, onCaptured, onClose }) {
  const { videoRef, overlayRef, status, detections, error } = useScanner({
    studentLookup,
    questionId,
    onCaptured,
  })

  return (
    <div className="conduct-modal-backdrop scanner-backdrop" role="presentation">
      <div
        className="conduct-modal scanner-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="assessment-scanner-title"
      >
        <header className="scanner-modal__header">
          <div className="scanner-modal__heading">
            <p className="scanner-modal__eyebrow">SR Code</p>
            <h2 id="assessment-scanner-title" className="scanner-modal__title">
              Scan SR Codes
            </h2>
            <p className="scanner-modal__subtitle">
              Hold student cards in frame. Answers are recorded automatically and stay on this
              device until you submit.
            </p>
          </div>
          <button
            type="button"
            className="scanner-modal__close"
            onClick={onClose}
            aria-label="Close scanner"
          >
            Close
          </button>
        </header>

        <div className="scanner-stage">
          <video ref={videoRef} className="scanner-stage__video" playsInline muted autoPlay />
          <canvas ref={overlayRef} className="scanner-stage__overlay" aria-hidden="true" />

          {status === 'starting' ? (
            <p className="scanner-stage__note" role="status">
              Starting camera…
            </p>
          ) : null}

          {status === 'live' ? (
            <p className="scanner-stage__note" role="status">
              Preparing detector…
            </p>
          ) : null}

          {status === 'ready' ? (
            <p className="scanner-stage__note" role="status">
              Scanning…
            </p>
          ) : null}

          {status === 'error' ? (
            <div className="scanner-stage__error" role="alert">
              <p className="scanner-stage__error-title">Scanner unavailable</p>
              <p className="scanner-stage__error-text">{error}</p>
            </div>
          ) : null}
        </div>

        <div className="scanner-results">
          <div className="scanner-results__header">
            <h3 className="scanner-results__title">Scanned</h3>
            <span className="scanner-results__count">{detections.length}</span>
          </div>

          {detections.length === 0 ? (
            <p className="scanner-results__empty">
              Detected answers appear here with the student and option (A–D).
            </p>
          ) : null}

          {detections.length > 0 ? (
            <ul className="scanner-results__list">
              {detections.map((detection) => (
                <li key={detection.studentQrCodeId || detection.studentId} className="scanner-result">
                  <div>
                    <p className="scanner-result__id">{detection.displayName || 'Unknown student'}</p>
                    <p className="scanner-result__meta">{detection.username || detection.displayName}</p>
                  </div>
                  <span className="scanner-result__answer">{detection.answer || '—'}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  )
}
