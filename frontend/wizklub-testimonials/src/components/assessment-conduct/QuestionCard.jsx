import { bumpRenderCount } from '../../utils/conductPerf'

/* Question card: overline Q-number, question text, answer tiles (A–D) — 1 column mobile, 2 on desktop. */
export default function QuestionCard({ question, empty }) {
  bumpRenderCount('QuestionCard')

  if (empty || !question) {
    return (
      <section className="ac-card ac-question">
        <div className="ac-empty">
          <p className="ac-empty__title">No questions</p>
          <p className="ac-empty__text">This assessment has no questions in the curriculum session.</p>
        </div>
      </section>
    )
  }

  const options = Array.isArray(question.options) ? question.options : []
  const images = Array.isArray(question.images) ? question.images : []

  return (
    <section className="ac-card ac-question" aria-labelledby={`q-${question.question_id}`}>
      <p className="ac-question__seq">Question {question.sequence}</p>
      <h2 className="ac-question__text" id={`q-${question.question_id}`}>
        {question.question}
      </h2>

      {images.length > 0 ? (
        <div className="ac-question__images" aria-label="Question images">
          {images.map((src, index) => (
            <img
              key={`${question.question_id}-img-${index}`}
              className="ac-img"
              src={src}
              alt=""
              decoding="async"
              loading="lazy"
            />
          ))}
        </div>
      ) : null}

      <ul className="ac-options" aria-label="Answer options">
        {options.map((option) => (
          <li key={option.key ?? option.id} className="ac-option">
            <span className="ac-option__key">{option.key ?? option.id}</span>
            <div className="ac-option__body">
              {option.image_url ? (
                <img className="ac-img ac-img--option" src={option.image_url} alt="" decoding="async" loading="lazy" />
              ) : null}
              {option.text ? <span className="ac-option__text">{option.text}</span> : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
