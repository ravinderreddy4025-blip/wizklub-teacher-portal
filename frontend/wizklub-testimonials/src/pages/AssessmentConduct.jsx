import { Profiler, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-toastify'
import AssessmentHeader from '../components/assessment-conduct/AssessmentHeader'
import AssessmentScanner from '../components/assessment-conduct/AssessmentScanner'
import BottomNavigation from '../components/assessment-conduct/BottomNavigation'
import ConductStudentList from '../components/assessment-conduct/ConductStudentList'
import QuestionCard from '../components/assessment-conduct/QuestionCard'
import AppShell from '../components/layout/AppShell'
import LoadingScreen from '../components/ui/LoadingScreen'
import { useAssessmentConduct } from '../hooks/useAssessmentConduct'
import { clearAlreadyScanned } from '../hooks/useScanner'
import { useNavigate } from '../router'
import { onConductProfilerRender } from '../utils/conductPerf'
import '../styles/app.css'
import './pages.css'
import './assessment-conduct.css'

function formatSubmitFailureReason(result) {
  if (result?.failure_stage) {
    return String(result.failure_stage).replace(/_/g, ' ')
  }
  if (result?.status === 'SKIPPED_ALREADY_COMPLETED') return 'Already completed'
  return result?.status || 'Submit failed'
}

export default function AssessmentConduct({ schoolId = '', batchId, sessionId }) {
  const navigate = useNavigate()
  const [scannerOpen, setScannerOpen] = useState(false)
  const {
    context,
    loading,
    error,
    forbidden,
    questionIndex,
    currentQuestion,
    totalQuestions,
    students,
    studentLookup,
    addCapturedResponse,
    submitAssessment,
    submitting,
    pendingCount,
    missingSrCardCount,
    goNext,
    goPrevious,
    canGoPrevious,
    canGoNext,
  } = useAssessmentConduct(batchId, sessionId)

  const currentQuestionId = currentQuestion?.question_id || ''
  const capturedCount = useMemo(() => students.filter((s) => s.captured).length, [students])

  useEffect(() => {
    clearAlreadyScanned()
  }, [currentQuestionId])

  const backPath = schoolId
    ? `/schools/${schoolId}/batches/${batchId}/students`
    : `/batches/${batchId}/students`

  const handleSubmitAssessment = async () => {
    if (submitting) return
    const result = await submitAssessment()
    if (!result?.ok) {
      toast.error(result?.error || 'Failed to submit assessment.')
      return
    }

    const { submittedCount = 0, skippedCount = 0, failedCount = 0, failedResults = [] } = result
    const successTotal = submittedCount + skippedCount

    if (failedCount > 0) {
      const reasons = failedResults
        .map((row) => `${row.student_id}: ${formatSubmitFailureReason(row)}`)
        .join('; ')
      toast.warn(
        reasons
          ? `Submitted ${successTotal} student(s). ${failedCount} failed — ${reasons}`
          : `Submitted ${successTotal} student(s). ${failedCount} failed — retry remaining scans.`,
      )
      return
    }

    toast.success(
      successTotal
        ? `Assessment submitted successfully for ${successTotal} student(s).`
        : 'Assessment submit completed.',
    )
  }

  if (loading) {
    return (
      <AppShell
        topBarVariant="back"
        activeTab="schools"
        showFab={false}
        showBottomNav={false}
        onBack={() => navigate(backPath)}
      >
        <LoadingScreen message="Loading assessment…" />
      </AppShell>
    )
  }

  if (forbidden || error || !context) {
    return (
      <AppShell
        topBarVariant="back"
        activeTab="schools"
        showFab={false}
        showBottomNav={false}
        onBack={() => navigate(backPath)}
      >
        <div className="ac-card ac-empty ac-empty--page">
          <p className="ac-empty__title">
            {forbidden ? 'You do not have access to this assessment' : 'Could not load the assessment'}
          </p>
          <p className="ac-empty__text">
            {error || 'The assessment could not be loaded. Check your connection and try again.'}
          </p>
          <button type="button" className="ac-btn ac-btn--primary" onClick={() => navigate(backPath)}>
            Back to assessments
          </button>
        </div>
      </AppShell>
    )
  }

  const assessment = context.assessment || {}
  const batchName = context.batch?.name || batchId

  return (
    <AppShell
      topBarVariant="back"
      activeTab="schools"
      showFab={false}
      showBottomNav={false}
      onBack={() => navigate(backPath)}
      className="conduct-shell"
    >
      <Profiler id="AssessmentConduct" onRender={onConductProfilerRender}>
        <div className="ac-page">
          <AssessmentHeader
            title={assessment.title}
            batchName={batchName}
            questionIndex={questionIndex}
            totalQuestions={totalQuestions}
            duration={assessment.duration}
            status={assessment.status}
            capturedCount={capturedCount}
            studentCount={students.length}
            missingSrCardCount={missingSrCardCount}
          />

          <div className="ac-layout">
            <Profiler id="QuestionCard" onRender={onConductProfilerRender}>
              <QuestionCard question={currentQuestion} empty={totalQuestions === 0} />
            </Profiler>

            <Profiler id="ConductStudentList" onRender={onConductProfilerRender}>
              <ConductStudentList students={students} missingSrCardCount={missingSrCardCount} />
            </Profiler>
          </div>
        </div>
      </Profiler>

      <BottomNavigation
        canGoPrevious={canGoPrevious}
        canGoNext={canGoNext}
        disableNav={totalQuestions === 0 || submitting}
        submitting={submitting}
        pendingCount={pendingCount}
        showSubmit={totalQuestions > 0 && !canGoNext}
        onPrevious={goPrevious}
        onNext={goNext}
        onScan={() => setScannerOpen(true)}
        onFinish={handleSubmitAssessment}
      />

      {scannerOpen ? (
        <AssessmentScanner
          studentLookup={studentLookup}
          questionId={currentQuestionId}
          onCaptured={addCapturedResponse}
          onClose={() => setScannerOpen(false)}
        />
      ) : null}
    </AppShell>
  )
}
