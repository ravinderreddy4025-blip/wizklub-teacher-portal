/**
 * Map SR card physical orientation (A–D) to the legacy option key from Conduct API.
 *
 * Scanner output is always position on the card. Each question's ``options[]`` entry
 * supplies ``key`` (same as legacy ``level_options.options`` dict keys). Submit
 * must send that key as ``selected_option`` — never infer or regenerate it here.
 */

export const SCAN_POSITIONS = ['A', 'B', 'C', 'D']

export const INVALID_SCAN_ANSWER_MESSAGE =
  'Invalid answer for this question. Please rescan.'

export function buildQuestionOptionsById(questions, mediaByQuestionId = {}) {
  const byId = {}
  for (const question of questions || []) {
    const questionId = question?.question_id
    if (!questionId) continue
    const mediaOptions = mediaByQuestionId[questionId]?.options
    const baseOptions = question?.options
    byId[questionId] =
      Array.isArray(mediaOptions) && mediaOptions.length
        ? mediaOptions
        : Array.isArray(baseOptions)
          ? baseOptions
          : []
  }
  return byId
}

function legacyOptionKey(option) {
  const key = option?.key ?? option?.id
  if (key == null) return ''
  return String(key).trim()
}

export function mapScanOrientationToOptionKey(orientation, options) {
  const letter = String(orientation ?? '').trim().toUpperCase()
  if (!letter || !SCAN_POSITIONS.includes(letter)) {
    return { ok: false }
  }

  const optionList = Array.isArray(options) ? options : []
  const position = SCAN_POSITIONS.indexOf(letter)
  if (position >= optionList.length) {
    return { ok: false }
  }

  const optionKey = legacyOptionKey(optionList[position])
  if (!optionKey) {
    return { ok: false }
  }

  return { ok: true, optionKey }
}

export function buildSubmitRequestBody(pendingResponses, questionOptionsById) {
  const responses = []
  let hasInvalid = false

  for (const [questionId, byStudent] of Object.entries(pendingResponses || {})) {
    const options = questionOptionsById?.[questionId] ?? []
    for (const entry of Object.values(byStudent || {})) {
      const orientation = String(entry?.answer ?? '').trim()
      if (!entry?.studentId || !questionId || !orientation) continue

      const mapped = mapScanOrientationToOptionKey(orientation, options)
      if (!mapped.ok) {
        hasInvalid = true
        continue
      }

      responses.push({
        student_id: entry.studentId,
        question_id: questionId,
        selected_option: mapped.optionKey,
      })
    }
  }

  return { responses, hasInvalid }
}
