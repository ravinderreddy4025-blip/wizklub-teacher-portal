import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api/client'
import {
  installConductLongTaskObserver,
  installMediaRequestCounter,
  isConductPerfEnabled,
  logConductPerf,
  resetRenderCounts,
} from '../utils/conductPerf'
import { buildStudentLookup, resolveStudentFromSrCodeId } from '../utils/scanner/studentLookup'
import {
  buildQuestionOptionsById,
  buildSubmitRequestBody,
  INVALID_SCAN_ANSWER_MESSAGE,
} from '../utils/assessment/scanOptionMapper'

function overlayPendingAnswers(students, pendingResponses, questionId) {
  const byStudent = questionId ? pendingResponses[questionId] : null
  if (!students.length || !byStudent) return students

  return students.map((student) => {
    const capture = byStudent[student.student_id] || byStudent[student.username]
    if (!capture) return student
    return {
      ...student,
      captured: true,
      response: {
        ...(student.response || {}),
        selected_answer: capture.answer,
        timestamp: capture.capturedAt,
      },
    }
  })
}

function countPendingResponses(pendingResponses) {
  let total = 0
  for (const byStudent of Object.values(pendingResponses || {})) {
    total += Object.keys(byStudent || {}).length
  }
  return total
}

function isSuccessfulSubmitStatus(status) {
  return status === 'COMPLETED' || status === 'SKIPPED_ALREADY_COMPLETED'
}

function removeSubmittedStudentsFromPending(pendingResponses, successfulStudentIds) {
  if (!successfulStudentIds.size) return pendingResponses
  const next = { ...pendingResponses }
  for (const [questionId, byStudent] of Object.entries(next)) {
    const remaining = { ...byStudent }
    for (const studentId of successfulStudentIds) {
      delete remaining[studentId]
    }
    if (Object.keys(remaining).length === 0) {
      delete next[questionId]
    } else {
      next[questionId] = remaining
    }
  }
  return next
}

function overlaySubmitResults(students, submitResultsByStudentId) {
  if (!students.length || !submitResultsByStudentId) return students
  return students.map((student) => {
    const studentId = student.student_id || student.username
    const submitResult = submitResultsByStudentId[studentId]
    if (!submitResult) return student
    return {
      ...student,
      submit_status: submitResult.status,
      submit_failure_stage: submitResult.failure_stage,
      submit_score_total: submitResult.score_total,
      submit_score_percentage: submitResult.score_percentage,
      submit_points_awarded: submitResult.points_awarded,
    }
  })
}

function pendingCount(pendingResponses) {
  return countPendingResponses(pendingResponses)
}

function mark(name) {
  try {
    if (typeof performance !== 'undefined' && performance.mark) {
      performance.mark(name)
    }
  } catch {
    // ignore missing Performance API
  }
}

function measure(name, startMark, endMark) {
  if (!isConductPerfEnabled()) return
  try {
    if (typeof performance !== 'undefined' && performance.measure) {
      performance.measure(name, startMark, endMark)
      const entries = performance.getEntriesByName(name)
      const last = entries[entries.length - 1]
      if (last) {
        logConductPerf(name, `${Math.round(last.duration)}ms`)
      }
    }
  } catch {
    // ignore measure failures (missing marks)
  }
}

/**
 * Thin client for Teacher Assessment Conduct.
 * Domain state (students, responses, summary) comes from wizklub_api only.
 * Question navigation triggers a fresh Question Conduct State fetch.
 * Inline question media is lazy-loaded per active question via /media into
 * a separate map — never written back into context.questions — so the student
 * list does not re-render when media arrives.
 */
export function useAssessmentConduct(batchId, sessionId) {
  const [context, setContext] = useState(null)
  const [students, setStudents] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [forbidden, setForbidden] = useState(false)
  const [questionIndex, setQuestionIndex] = useState(0)
  /** @type {[Record<string, object>, Function]} */
  const [mediaByQuestionId, setMediaByQuestionId] = useState({})
  const [pendingResponses, setPendingResponses] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [submitResultsByStudentId, setSubmitResultsByStudentId] = useState({})
  const skipInitialQuestionFetch = useRef(true)
  const mediaLoadedRef = useRef(new Set())
  const mediaInFlightRef = useRef(new Set())
  const renderMarkedRef = useRef(false)

  const applyQuestionState = useCallback((payload) => {
    if (!payload) return
    if (Array.isArray(payload.students)) setStudents(payload.students)
    if (payload.summary) setSummary(payload.summary)
  }, [])

  useEffect(() => {
    if (!isConductPerfEnabled()) return undefined
    resetRenderCounts()
    const stopLong = installConductLongTaskObserver()
    const stopFetch = installMediaRequestCounter()
    return () => {
      stopLong()
      stopFetch()
    }
  }, [])

  const load = useCallback(async () => {
    if (!batchId || !sessionId) {
      setLoading(false)
      setError('Missing batch or assessment session.')
      return
    }

    setLoading(true)
    setError('')
    setForbidden(false)
    skipInitialQuestionFetch.current = true
    mediaLoadedRef.current = new Set()
    mediaInFlightRef.current = new Set()
    setMediaByQuestionId({})
    setPendingResponses({})
    setSubmitResultsByStudentId({})
    renderMarkedRef.current = false

    mark('conduct-fetch-start')
    const result = await api.getAssessmentConduct(batchId, sessionId)
    mark('conduct-fetch-end')
    measure('conduct-fetch', 'conduct-fetch-start', 'conduct-fetch-end')

    if (!result) {
      setContext(null)
      setStudents([])
      setSummary(null)
      setError('Assessment not found.')
      setLoading(false)
      return
    }
    if (result.forbidden) {
      setContext(null)
      setStudents([])
      setSummary(null)
      setForbidden(true)
      setError('You do not have permission to conduct this assessment.')
      setLoading(false)
      return
    }
    if (result.error) {
      setContext(null)
      setStudents([])
      setSummary(null)
      setError(result.message || 'Failed to load assessment.')
      setLoading(false)
      return
    }

    mark('conduct-render-start')
    setContext(result)
    applyQuestionState(result)
    const startIndex = Number.isInteger(result.current_question_index)
      ? result.current_question_index
      : 0
    setQuestionIndex(Math.max(0, startIndex))
    setLoading(false)
  }, [batchId, sessionId, applyQuestionState])

  useEffect(() => {
    load()
  }, [load])

  // Measure first paint after context lands (post LoadingScreen).
  useEffect(() => {
    if (loading || !context || renderMarkedRef.current) return undefined
    renderMarkedRef.current = true
    const raf = window.requestAnimationFrame(() => {
      mark('conduct-render-end')
      measure('conduct-render', 'conduct-render-start', 'conduct-render-end')
    })
    return () => window.cancelAnimationFrame(raf)
  }, [loading, context])

  const questions = context?.questions ?? []
  const totalQuestions = questions.length
  const baseQuestion = totalQuestions > 0 ? questions[questionIndex] ?? null : null
  const currentQuestionId = baseQuestion?.question_id || ''

  const currentQuestion = useMemo(() => {
    if (!baseQuestion) return null
    const media = mediaByQuestionId[baseQuestion.question_id]
    if (!media) return baseQuestion
    return {
      ...baseQuestion,
      images: media.images ?? baseQuestion.images,
      options: media.options ?? baseQuestion.options,
      has_images: media.has_images ?? baseQuestion.has_images,
    }
  }, [baseQuestion, mediaByQuestionId])

  const studentLookup = useMemo(() => buildStudentLookup(students), [students])

  const questionOptionsById = useMemo(
    () => buildQuestionOptionsById(questions, mediaByQuestionId),
    [questions, mediaByQuestionId],
  )

  const studentsWithCaptures = useMemo(
    () => overlayPendingAnswers(students, pendingResponses, currentQuestionId),
    [students, pendingResponses, currentQuestionId],
  )

  const studentsWithSubmitState = useMemo(
    () => overlaySubmitResults(studentsWithCaptures, submitResultsByStudentId),
    [studentsWithCaptures, submitResultsByStudentId],
  )

  const refreshQuestionState = useCallback(async () => {
    if (!batchId || !sessionId || !currentQuestionId) return
    const result = await api.getQuestionResponses(batchId, sessionId, currentQuestionId)
    if (!result || result.forbidden) return
    applyQuestionState(result)
  }, [batchId, sessionId, currentQuestionId, applyQuestionState])

  const hydrateQuestionMedia = useCallback(async () => {
    if (!batchId || !sessionId || !currentQuestionId) return
    if (mediaLoadedRef.current.has(currentQuestionId)) return
    if (mediaInFlightRef.current.has(currentQuestionId)) return
    if (!baseQuestion?.has_images) {
      mediaLoadedRef.current.add(currentQuestionId)
      return
    }

    mediaInFlightRef.current.add(currentQuestionId)
    mark('question-media-start')
    const detail = await api.getAssessmentQuestionMedia(batchId, sessionId, currentQuestionId)
    mark('question-media-end')
    measure('question-media', 'question-media-start', 'question-media-end')
    mediaInFlightRef.current.delete(currentQuestionId)

    if (!detail || detail.forbidden) return
    mediaLoadedRef.current.add(currentQuestionId)

    // Keep media out of `context` so ConductStudentList props stay referentially stable.
    setMediaByQuestionId((prev) => ({
      ...prev,
      [currentQuestionId]: {
        images: detail.images ?? [],
        options: detail.options ?? [],
        has_images: detail.has_images ?? true,
      },
    }))
  }, [batchId, sessionId, currentQuestionId, baseQuestion?.has_images])

  useEffect(() => {
    if (!batchId || !sessionId || !currentQuestionId) return undefined
    // Defer media so first paint of the conduct page stays responsive.
    const timer = window.setTimeout(() => {
      void hydrateQuestionMedia()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [batchId, sessionId, currentQuestionId, hydrateQuestionMedia])

  // Only re-fetch roster/responses when the active question changes — NOT when
  // context object identity changes (that previously re-ran on every media merge).
  useEffect(() => {
    if (!currentQuestionId) return
    if (skipInitialQuestionFetch.current) {
      skipInitialQuestionFetch.current = false
      return
    }
    refreshQuestionState()
  }, [currentQuestionId, refreshQuestionState])

  const addCapturedResponse = useCallback(
    (scan) => {
      const studentQrCodeId = Number(scan?.studentQrCodeId)
      if (!currentQuestionId || !scan?.answer) return
      if (!Number.isInteger(studentQrCodeId) || studentQrCodeId < 1) return
      const resolved = resolveStudentFromSrCodeId(studentQrCodeId, studentLookup)
      const studentId = scan?.studentId || resolved?.studentId
      if (!studentId) return
      setPendingResponses((prev) => ({
        ...prev,
        [currentQuestionId]: {
          ...(prev[currentQuestionId] || {}),
          [studentId]: {
            studentQrCodeId,
            studentId,
            answer: scan.answer,
            capturedAt: new Date().toISOString(),
          },
        },
      }))
    },
    [currentQuestionId, studentLookup],
  )

  const submitAssessment = useCallback(async () => {
    const { responses, hasInvalid } = buildSubmitRequestBody(
      pendingResponses,
      questionOptionsById,
    )
    if (hasInvalid) {
      return { ok: false, error: INVALID_SCAN_ANSWER_MESSAGE }
    }
    const body = { responses }
    if (!body.responses.length) {
      return { ok: false, error: 'No captured responses yet. Scan cards first, then submit.' }
    }
    if (!batchId || !sessionId) {
      return { ok: false, error: 'Missing assessment context.' }
    }

    setSubmitting(true)
    const result = await api.submitAssessment(batchId, sessionId, body)
    setSubmitting(false)

    if (result?.forbidden) {
      return { ok: false, forbidden: true, error: 'You do not have permission to submit this assessment.' }
    }
    if (!result?.ok) {
      return {
        ok: false,
        error: result.error || 'Failed to submit assessment.',
        status: result.status,
      }
    }

    const data = result.data || {}
    const studentResults = Array.isArray(data.students) ? data.students : []
    const successfulStudentIds = new Set()
    const failedResults = []
    const nextSubmitResults = { ...submitResultsByStudentId }

    for (const row of studentResults) {
      if (!row?.student_id) continue
      nextSubmitResults[row.student_id] = row
      if (isSuccessfulSubmitStatus(row.status)) {
        successfulStudentIds.add(row.student_id)
      } else {
        failedResults.push(row)
      }
    }

    setSubmitResultsByStudentId(nextSubmitResults)
    setPendingResponses((prev) => removeSubmittedStudentsFromPending(prev, successfulStudentIds))

    return {
      ok: true,
      data,
      submittedCount: Number(data.submitted_count) || 0,
      skippedCount: Number(data.skipped_count) || 0,
      failedCount: Number(data.failed_count) || 0,
      failedResults,
    }
  }, [batchId, sessionId, pendingResponses, questionOptionsById, submitResultsByStudentId])

  const goNext = useCallback(() => {
    setQuestionIndex((index) => Math.min(index + 1, Math.max(totalQuestions - 1, 0)))
  }, [totalQuestions])

  const goPrevious = useCallback(() => {
    setQuestionIndex((index) => Math.max(index - 1, 0))
  }, [])

  return {
    context,
    loading,
    error,
    forbidden,
    questionIndex,
    currentQuestion,
    totalQuestions,
    students: studentsWithSubmitState,
    studentLookup,
    pendingCount: pendingCount(pendingResponses),
    addCapturedResponse,
    submitAssessment,
    submitting,
    summary,
    missingSrCardCount: summary?.missing_sr_card_count ?? 0,
    goNext,
    goPrevious,
    canGoPrevious: questionIndex > 0,
    canGoNext: questionIndex < totalQuestions - 1,
  }
}
