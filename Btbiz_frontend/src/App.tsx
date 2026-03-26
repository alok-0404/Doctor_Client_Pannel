import { Routes, Route, Navigate } from 'react-router-dom'
import { PublicHome } from './pages/PublicHome'
import { BookAppointment } from './pages/BookAppointment'
import { PatientLogin } from './pages/PatientLogin'
import { PatientProfile } from './pages/PatientProfile'
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
import { SuperAdminDashboard } from './pages/SuperAdminDashboard'
import { PatientSearch } from './pages/PatientSearch'
import { PatientDetails } from './pages/PatientDetails'
import { ProtectedRoute } from './components/ProtectedRoute'
import { ProtectedPatientRoute } from './components/ProtectedPatientRoute'
import { DoctorNotificationListener } from './components/DoctorNotificationListener'
import { GlobalBackButton } from './components/GlobalBackButton'
import HandwritingExtractor from './components/HandwritingExtractor'

export const App = () => {
  return (
    <>
      <DoctorNotificationListener />
      <GlobalBackButton />
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
        path="/patient-login"
        element={<PatientLogin />}
      />
      <Route
        path="/patient-profile"
        element={(
          <ProtectedPatientRoute>
            <PatientProfile />
          </ProtectedPatientRoute>
        )}
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
        path="/super-admin"
        element={(
          <ProtectedRoute allowedRoles={['SUPER_ADMIN']}>
            <SuperAdminDashboard />
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
        path="/search-patients"
        element={(
          <ProtectedRoute allowedRoles={['DOCTOR']}>
            <PatientSearch />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/patient/:id"
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
