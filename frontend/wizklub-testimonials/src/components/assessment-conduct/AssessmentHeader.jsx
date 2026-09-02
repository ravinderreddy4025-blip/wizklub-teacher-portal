function formatStatus(status) {
  const normalized = String(status || '').trim().toUpperCase()
  if (!normalized) return 'Unknown'
  return normalized
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ')
}

export default function AssessmentHeader({
  title,
  questionIndex,
  totalQuestions,
  duration,
  status,
}) {
  const questionLabel =
    totalQuestions > 0
      ? `Question ${questionIndex + 1} of ${totalQuestions}`
      : 'No questions'

  return (
    <header className="conduct-header">
      <div className="conduct-header__top">
        <div>
          <p className="conduct-header__eyebrow">Assessment</p>
          <h1 className="conduct-header__title">{title || 'Assessment'}</h1>
        </div>
        <span className="assessment-status assessment-status--pending">
          {formatStatus(status)}
        </span>
      </div>
      <div className="conduct-header__meta">
        <span>{questionLabel}</span>
        {duration ? <span>{duration} min</span> : null}
      </div>
    </header>
  )
}
