import { Routes, Route, Navigate } from 'react-router-dom'
import { PublicHome } from './pages/PublicHome'
import { BookAppointment } from './pages/BookAppointment'
import { Landing } from './pages/Landing'
import { Login } from './pages/Login'
import { Register } from './pages/Register'
import { RegisterLabManager } from './pages/RegisterLabManager'
import { RegisterMedicine } from './pages/RegisterMedicine'
import { MedicineDashboard } from './pages/MedicineDashboard'
import { Dashboard } from './pages/Dashboard'
import { AssistantDashboard } from './pages/AssistantDashboard.tsx'
import { LabDashboard } from './pages/LabDashboard'
import { LabManagerDashboard } from './pages/LabManagerDashboard'
import { PatientSearch } from './pages/PatientSearch'
import { PatientDetails } from './pages/PatientDetails'
import { ProtectedRoute } from './components/ProtectedRoute'
import { DoctorNotificationListener } from './components/DoctorNotificationListener'
import HandwritingExtractor from './components/HandwritingExtractor'

export const App = () => {
  return (
    <>
      <DoctorNotificationListener />
      <Routes>
      <Route
        path="/"
        element={<PublicHome />}
      />
      <Route
        path="/portal"
        element={<Landing />}
      />
      <Route
        path="/book-appointment"
        element={<BookAppointment />}
      />
      <Route
        path="/login"
        element={<Login />}
      />
      <Route
        path="/register"
        element={<Register />}
      />
      <Route
        path="/register-lab-manager"
        element={<RegisterLabManager />}
      />
      <Route
        path="/register-medicine"
        element={<RegisterMedicine />}
      />
      <Route
        path="/medicine"
        element={(
          <ProtectedRoute allowedRoles={['PHARMACY']}>
            <MedicineDashboard />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/dashboard"
        element={(
          <ProtectedRoute allowedRoles={['DOCTOR']}>
            <Dashboard />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/assistant"
        element={(
          <ProtectedRoute allowedRoles={['ASSISTANT']}>
            <AssistantDashboard />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/lab"
        element={(
          <ProtectedRoute allowedRoles={['LAB_ASSISTANT']}>
            <LabDashboard />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/lab-manager"
        element={(
          <ProtectedRoute allowedRoles={['LAB_MANAGER']}>
            <LabManagerDashboard />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/ocr"
        element={(
          <ProtectedRoute allowedRoles={['DOCTOR']}>
            <HandwritingExtractor />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/patients/search"
        element={(
          <ProtectedRoute allowedRoles={['DOCTOR']}>
            <PatientSearch />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/patients/:id"
        element={(
          <ProtectedRoute allowedRoles={['DOCTOR']}>
            <PatientDetails />
          </ProtectedRoute>
        )}
      />
      <Route
        path="*"
        element={<Navigate to="/" replace />}
      />
    </Routes>
    </>
  )
}

export default App
