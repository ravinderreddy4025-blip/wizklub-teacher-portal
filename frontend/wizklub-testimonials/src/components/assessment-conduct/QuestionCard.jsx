import { bumpRenderCount } from '../../utils/conductPerf'

export default function QuestionCard({ question, empty }) {
  bumpRenderCount('QuestionCard')

  if (empty || !question) {
    return (
      <section className="conduct-question-card">
        <div className="empty-state" style={{ padding: '24px 12px' }}>
          <p className="empty-state__title">No questions</p>
          <p className="empty-state__text">
            This assessment has no questions in the curriculum session.
          </p>
        </div>
      </section>
    )
  }

  const options = Array.isArray(question.options) ? question.options : []
  const images = Array.isArray(question.images) ? question.images : []

  return (
    <section className="conduct-question-card">
      <p className="conduct-question-card__sequence">Q{question.sequence}</p>
      <h2 className="conduct-question-card__text">{question.question}</h2>

      {images.length > 0 ? (
        <div className="conduct-question-images" aria-label="Question images">
          {images.map((src, index) => (
            <img
              key={`${question.question_id}-img-${index}`}
              className="conduct-question-image"
              src={src}
              alt=""
              decoding="async"
              loading="lazy"
            />
          ))}
        </div>
      ) : null}

      <ul className="conduct-options" aria-label="Answer options">
        {options.map((option) => (
          <li key={option.key ?? option.id} className="conduct-option">
            <span className="conduct-option__id">{option.key ?? option.id}</span>
            <div className="conduct-option__body">
              {option.image_url ? (
                <img
                  className="conduct-option__image"
                  src={option.image_url}
                  alt=""
                  decoding="async"
                  loading="lazy"
                />
              ) : null}
              {option.text ? (
                <span className="conduct-option__text">{option.text}</span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
