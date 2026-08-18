import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import InventorySection from './inventory/InventorySection'
import Login from './components/Login'
import PwaInstallBanner from './components/PwaInstallBanner'
import { RequireAuth } from './context/AuthContext.jsx'
import Analytics from './pages/Analytics'
import Dashboard from './pages/Dashboard'
import BatchSelection from './pages/BatchSelection'
import FeedbackDetail from './pages/FeedbackDetail'
import FeedbackForm from './pages/FeedbackForm'
import FeedbackList from './pages/FeedbackList'
import Profile from './pages/Profile'
import SchoolsList from './pages/SchoolsList'
import StudentList from './pages/StudentList'
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
  const studentsRoute = matchPath(path, '/batches/:batchId/students')
  const studentRoute = matchPath(path, '/students/:studentId')
  const feedbackDetailRoute = matchPath(path, '/feedback/:feedbackId')

  const isKnownRoute =
    path === '/dashboard' ||
    path === '/home' ||
    path === '/schools' ||
    path === '/analytics' ||
    path === '/feedback' ||
    path === '/feedback/new' ||
    path === '/profile' ||
    path === '/inventory' ||
    path.startsWith('/inventory/') ||
    path === '/' ||
    batchRoute ||
    schoolStudentsRoute ||
    studentsRoute ||
    studentRoute ||
    (feedbackDetailRoute && feedbackDetailRoute.feedbackId !== 'new')

  return (
    <RequireAuth>
      {!isKnownRoute && <Dashboard />}
      {(path === '/dashboard' || path === '/home' || path === '/') && <Dashboard />}
      {path === '/schools' && <SchoolsList />}
      {path === '/analytics' && <Analytics />}
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
      {studentRoute && <StudentProfile studentId={studentRoute.studentId} />}
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
