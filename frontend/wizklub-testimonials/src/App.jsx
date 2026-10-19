import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import InventorySection from './inventory/InventorySection'
import Login from './components/Login'
import PwaInstallBanner from './components/PwaInstallBanner'
import { RequireAuth } from './context/AuthContext.jsx'
import AssessmentConduct from './pages/AssessmentConduct'
import Analytics from './pages/Analytics'
import AnalyticsReport from './pages/AnalyticsReport'
import Dashboard from './pages/Dashboard'
import BatchSelection from './pages/BatchSelection'
import BatchHealth from './pages/BatchHealth'
import FeedbackDetail from './pages/FeedbackDetail'
import LiveClass from './pages/LiveClass'
import FeedbackForm from './pages/FeedbackForm'
import FeedbackList from './pages/FeedbackList'
import Profile from './pages/Profile'
import SchoolsList from './pages/SchoolsList'
import StudentList from './pages/StudentList'
import StudentHealth from './pages/StudentHealth'
import StudentProfile from './pages/StudentProfile'
import { Router, matchPath, usePath } from './router'

function AppRoutes() {
  const path = usePath()

  if (path === '/login') return <Login />

  if (path === '/inventory' || path.startsWith('/inventory/')) {
    return (
      <RequireAuth>
        <InventorySection />
      </RequireAuth>
    )
  }

  const batchRoute = matchPath(path, '/schools/:schoolId/batches')
  const schoolStudentsRoute = matchPath(path, '/schools/:schoolId/batches/:batchId/students')
  const schoolAssessmentRoute = matchPath(
    path,
    '/schools/:schoolId/batches/:batchId/assessments/:sessionId',
  )
  const classRoute =
    matchPath(path, '/schools/:schoolId/batches/:batchId/class') || matchPath(path, '/batches/:batchId/class')
  const studentsRoute = matchPath(path, '/batches/:batchId/students')
  const assessmentRoute = matchPath(path, '/batches/:batchId/assessments/:sessionId')
  const studentRoute = matchPath(path, '/students/:studentId')
  const feedbackDetailRoute = matchPath(path, '/feedback/:feedbackId')
  const batchHealthRoute =
    matchPath(path, '/schools/:schoolId/batches/:batchId/health') || matchPath(path, '/batches/:batchId/health')
  const studentHealthRoute =
    matchPath(path, '/schools/:schoolId/batches/:batchId/health/students/:username') ||
    matchPath(path, '/batches/:batchId/health/students/:username')

  const isKnownRoute =
    path === '/dashboard' ||
    path === '/home' ||
    path === '/schools' ||
    path === '/analytics' ||
    path === '/analytics-report' ||
    path === '/student-health-report' ||
    path === '/student-health' ||
    path.startsWith('/analytics-report/') ||
    path.startsWith('/student-health-report/') ||
    path.startsWith('/student-health/') ||
    path === '/feedback' ||
    path === '/feedback/new' ||
    path === '/profile' ||
    path === '/inventory' ||
    path.startsWith('/inventory/') ||
    path === '/' ||
    batchRoute ||
    schoolStudentsRoute ||
    schoolAssessmentRoute ||
    studentsRoute ||
    classRoute ||
    assessmentRoute ||
    studentRoute ||
    batchHealthRoute ||
    studentHealthRoute ||
    (feedbackDetailRoute && feedbackDetailRoute.feedbackId !== 'new')

  return (
    <RequireAuth>
      {!isKnownRoute && <Dashboard />}
      {(path === '/dashboard' || path === '/home' || path === '/') && <Dashboard />}
      {path === '/schools' && <SchoolsList />}
      {path === '/analytics' && <Analytics />}
      {(path === '/analytics-report' ||
        path === '/student-health-report' ||
        path === '/student-health' ||
        path.startsWith('/analytics-report/') ||
        path.startsWith('/student-health-report/') ||
        path.startsWith('/student-health/')) && <AnalyticsReport />}
      {path === '/feedback' && <FeedbackList />}
      {path === '/feedback/new' && <FeedbackForm />}
      {feedbackDetailRoute && feedbackDetailRoute.feedbackId !== 'new' && (
        <FeedbackDetail feedbackId={feedbackDetailRoute.feedbackId} />
      )}
      {batchRoute && <BatchSelection schoolId={batchRoute.schoolId} />}
      {schoolStudentsRoute && (
        <StudentList
          batchId={schoolStudentsRoute.batchId}
          schoolId={schoolStudentsRoute.schoolId}
        />
      )}
      {!schoolStudentsRoute && studentsRoute && (
        <StudentList batchId={studentsRoute.batchId} />
      )}
      {schoolAssessmentRoute && (
        <AssessmentConduct
          schoolId={schoolAssessmentRoute.schoolId}
          batchId={schoolAssessmentRoute.batchId}
          sessionId={schoolAssessmentRoute.sessionId}
        />
      )}
      {!schoolAssessmentRoute && assessmentRoute && (
        <AssessmentConduct
          batchId={assessmentRoute.batchId}
          sessionId={assessmentRoute.sessionId}
        />
      )}
      {classRoute && (
        <LiveClass
          key={`${classRoute.schoolId ?? ''}/${classRoute.batchId}`}
          batchId={classRoute.batchId}
          schoolId={classRoute.schoolId ?? ''}
        />
      )}
      {studentRoute && <StudentProfile studentId={studentRoute.studentId} />}
      {batchHealthRoute && (
        <BatchHealth
          key={`${batchHealthRoute.schoolId ?? ''}/${batchHealthRoute.batchId}`}
          batchId={batchHealthRoute.batchId}
          schoolId={batchHealthRoute.schoolId ?? ''}
        />
      )}
      {studentHealthRoute && (
        <StudentHealth
          key={`${studentHealthRoute.batchId}/${studentHealthRoute.username}`}
          batchId={studentHealthRoute.batchId}
          username={studentHealthRoute.username}
          schoolId={studentHealthRoute.schoolId ?? ''}
        />
      )}
      {path === '/profile' && <Profile />}
    </RequireAuth>
  )
}

function App() {
  return (
    <Router>
      <AppRoutes />
      <PwaInstallBanner />
      <ToastContainer
        position="top-center"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        pauseOnFocusLoss={false}
        draggable
        pauseOnHover
        theme="light"
      />
    </Router>
  )
}

export default App
