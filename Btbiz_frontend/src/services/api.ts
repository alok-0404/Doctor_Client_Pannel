import axios from 'axios'
import { authStorage } from '../utils/authStorage'

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

export const api = axios.create({
  baseURL: API_BASE_URL,
})

api.interceptors.request.use((config) => {
  const token = authStorage.getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export interface DoctorLoginPayload {
  email: string
  password: string
}

export type DoctorRole = 'DOCTOR' | 'ASSISTANT' | 'LAB_ASSISTANT' | 'LAB_MANAGER' | 'PHARMACY'

export interface DoctorLoginResponse {
  token: string
  doctorName: string
  role: DoctorRole
}

export interface DoctorRegisterPayload {
  name: string
  email: string
  password: string
  phone: string
}

export interface StartForgotPasswordPayload {
  phone: string
}

export interface CompleteForgotPasswordPayload {
  phone: string
  otp: string
  newPassword: string
}

export interface AssistantSummary {
  id: string
  name: string
  email: string
  phone: string
  createdAt: string
  createdBy: {
    id: string
    name: string
    email: string
  } | null
}

export const authService = {
  async login(payload: DoctorLoginPayload): Promise<DoctorLoginResponse> {
    const res = await api.post('/auth/doctor/login', payload)
    const data = res.data as {
      accessToken: string
      doctor: { name: string; role: DoctorRole }
    }

    return {
      token: data.accessToken,
      doctorName: data.doctor.name,
      role: data.doctor.role,
    }
  },

  async register(payload: DoctorRegisterPayload): Promise<void> {
    await api.post('/auth/doctor/register', payload)
  },

  async registerLabManager(payload: DoctorRegisterPayload): Promise<DoctorLoginResponse> {
    const res = await api.post('/auth/lab-manager/register', payload)
    const data = res.data as {
      accessToken: string
      doctor: { name: string; role: DoctorRole }
    }
    return {
      token: data.accessToken,
      doctorName: data.doctor.name,
      role: data.doctor.role,
    }
  },

  async registerPharmacy(payload: DoctorRegisterPayload): Promise<DoctorLoginResponse> {
    const res = await api.post('/auth/pharmacy/register', payload)
    const data = res.data as {
      accessToken: string
      doctor: { name: string; role: DoctorRole }
    }
    return {
      token: data.accessToken,
      doctorName: data.doctor.name,
      role: data.doctor.role,
    }
  },

  async logout(): Promise<void> {
    try {
      await api.post('/auth/doctor/logout')
    } catch {
      // ignore logout errors on client
    }
  },

  async startForgotPassword(payload: StartForgotPasswordPayload): Promise<void> {
    await api.post('/auth/doctor/password/forgot', payload)
  },

  async completeForgotPassword(payload: CompleteForgotPasswordPayload): Promise<void> {
    await api.post('/auth/doctor/password/reset', payload)
  },

  async createAssistant(payload: {
    name: string
    email: string
    phone: string
    password: string
  }): Promise<void> {
    await api.post('/auth/assistant', payload)
  },

  async listAssistants(): Promise<AssistantSummary[]> {
    const res = await api.get('/auth/assistants')
    const data = res.data as { assistants: AssistantSummary[] }
    return data.assistants
  },

  async createLabAssistant(payload: {
    name: string
    email: string
    phone: string
    password: string
  }): Promise<void> {
    await api.post('/auth/lab-assistant', payload)
  },

  async listLabAssistants(): Promise<AssistantSummary[]> {
    const res = await api.get('/auth/lab-assistants')
    const data = res.data as { labAssistants: AssistantSummary[] }
    return data.labAssistants
  },

  async getProfile(): Promise<{
    doctor: {
      id: string
      name: string
      email: string
      role: string
      createdByDoctorId?: string
      referredToDoctorName?: string
      availabilityStatus?: 'available' | 'unavailable' | 'busy'
      unavailableReason?: string
      unavailableUntil?: string
    }
  }> {
    const res = await api.get('/auth/doctor/profile')
    return res.data as any
  },

  async updateDoctorAvailability(payload: {
    availabilityStatus: 'available' | 'unavailable' | 'busy'
    unavailableReason?: string
    unavailableUntil?: string
  }): Promise<{ availabilityStatus: string; unavailableReason?: string; unavailableUntil?: string }> {
    const res = await api.patch('/auth/doctor/availability', payload)
    return res.data
  },
}

export interface DoctorNotificationItem {
  id: string
  patientId: string
  patientName: string
  visitId: string
  status: 'unread' | 'dismissed' | 'read'
  source: 'ASSISTANT_REFERRAL' | 'ONLINE_APPOINTMENT'
  createdAt: string
}

export interface DoctorAppointmentItem {
  id: string
  patientId: string
  patientName: string
  patientMobile?: string
  visitDate: string
  reason?: string
  notes?: string
}

export const notificationService = {
  async getNotifications(): Promise<DoctorNotificationItem[]> {
    const res = await api.get('/notifications')
    const data = res.data as { notifications: DoctorNotificationItem[] }
    return data.notifications
  },

  async updateNotificationStatus(
    notificationId: string,
    status: 'read' | 'dismissed'
  ): Promise<void> {
    await api.patch(`/notifications/${notificationId}`, { status })
  },
}

export const appointmentService = {
  async getTodayAppointments(): Promise<DoctorAppointmentItem[]> {
    const res = await api.get('/appointments/doctor/today')
    const data = res.data as { appointments: DoctorAppointmentItem[] }
    return data.appointments
  },

  /** Upcoming (future) appointments for doctor – after today. */
  async getUpcomingAppointments(): Promise<{ appointments: DoctorAppointmentItem[]; total: number }> {
    const res = await api.get('/appointments/doctor/upcoming')
    const data = res.data as { appointments: DoctorAppointmentItem[]; total: number }
    return { appointments: data.appointments ?? [], total: data.total ?? 0 }
  },

  /** For assistant: linked doctor's today appointments (with patient mobile for calling/messaging). */
  async getAssistantDoctorTodayAppointments(): Promise<{ doctorId: string; appointments: DoctorAppointmentItem[] }> {
    const res = await api.get('/appointments/assistant/doctor-today')
    const data = res.data as { doctorId: string; appointments: DoctorAppointmentItem[] }
    return data
  },
}

export interface PatientSummary {
  id: string
  firstName: string
  lastName?: string
  mobileNumber: string
  gender?: string
  dateOfBirth?: string
  address?: string
  bloodGroup?: string
  previousHealthHistory?: string
  emergencyContactName?: string
  emergencyContactPhone?: string
}

export interface VisitVitals {
  bloodPressureSystolic?: number
  bloodPressureDiastolic?: number
  bloodSugarFasting?: number
  weightKg?: number
  temperature?: number
  otherVitalsNotes?: string
}

export interface DiagnosticTestItem {
  _id: string
  testName: string
  price?: number
  result?: string
  notes?: string
  createdAt?: string
  hasReport?: boolean
  reportFileName?: string
  reportUploadedAt?: string
}

export interface PharmacyDispensationSummary {
  id: string
  dispensedBy: string
  items: Array<{ medicineName: string; mrp: number; discount: number; quantity: number; amount: number }>
  subtotal: number
  totalDiscount: number
  totalAmount: number
  paidAmount: number
  paymentStatus: string
  paidAt?: string
  receiptNumber?: string
  createdAt: string
}

export interface PharmacyReceipt {
  id: string
  receiptNumber: string
  patient: { id: string; name: string; mobile: string }
  dispensedBy: string
  items: Array<{ medicineName: string; mrp: number; discount: number; quantity: number; amount: number }>
  subtotal: number
  totalDiscount: number
  totalAmount: number
  paidAmount: number
  paymentStatus: string
  paidAt?: string
  createdAt: string
}

export const pharmacyService = {
  async createDispensation(
    patientId: string,
    items: Array<{ medicineName: string; mrp: number; discount?: number; quantity?: number }>
  ): Promise<{ id: string; receiptNumber: string; subtotal: number; totalDiscount: number; totalAmount: number }> {
    const res = await api.post('/pharmacy/dispense', { patientId, items })
    return res.data as any
  },
  async recordPayment(dispensationId: string, paidAmount: number): Promise<{ paidAmount: number; paymentStatus: string }> {
    const res = await api.patch(`/pharmacy/dispense/${dispensationId}/payment`, { paidAmount })
    return res.data as any
  },
  async getReceipt(dispensationId: string): Promise<PharmacyReceipt> {
    const res = await api.get(`/pharmacy/dispense/${dispensationId}/receipt`)
    return res.data as PharmacyReceipt
  },
}

export interface FullPatientHistory {
  patient: PatientSummary & { _id: string }
  visits: Array<{
    _id: string
    visitDate: string
    reason?: string
    notes?: string
    bloodPressureSystolic?: number
    bloodPressureDiastolic?: number
    bloodSugarFasting?: number
    weightKg?: number
    temperature?: number
    otherVitalsNotes?: string
    doctor?: { name: string }
    labPaidAmount?: number
    labPaymentStatus?: 'UNPAID' | 'PARTIAL' | 'PAID'
    labPaidAt?: string
    diagnosticTests?: DiagnosticTestItem[]
  }>
  pharmacyDispensations?: PharmacyDispensationSummary[]
  documents: Array<{
    id: string
    originalName: string
    mimeType: string
    uploadedAt: string
  }>
}

export const patientService = {
  async searchByMobile(mobile: string): Promise<PatientSummary | null> {
    try {
      const res = await api.get('/patients/search', { params: { mobile } })
      const data = res.data as { patient: PatientSummary }
      return data.patient
    } catch (err: any) {
      if (err?.response?.status === 404) return null
      throw err
    }
  },

  async createPatient(payload: {
    firstName: string
    lastName?: string
    mobileNumber: string
    dateOfBirth?: string
    gender?: string
    address?: string
    bloodGroup?: string
    previousHealthHistory?: string
    emergencyContactName?: string
    emergencyContactPhone?: string
  }): Promise<PatientSummary> {
    const res = await api.post('/patients', payload)
    const data = res.data as { patient: PatientSummary }
    return data.patient
  },

  async updatePatient(
    patientId: string,
    payload: Partial<{
      firstName: string
      lastName: string
      mobileNumber: string
      dateOfBirth: string
      gender: string
      address: string
      bloodGroup: string
      previousHealthHistory: string
      emergencyContactName: string
      emergencyContactPhone: string
    }>
  ): Promise<PatientSummary> {
    const res = await api.patch(`/patients/${patientId}`, payload)
    const data = res.data as { patient: PatientSummary }
    return data.patient
  },

  async getFullHistory(patientId: string): Promise<FullPatientHistory> {
    const res = await api.get(`/patients/${patientId}/full-history`)
    return res.data as FullPatientHistory
  },

  async addDiagnosticTests(
    patientId: string,
    visitId: string,
    tests: Array<{ testName: string; price?: number }>
  ): Promise<void> {
    // Send both formats: backend may be new (accepts tests[]) or old (accepts testNames[])
    const testNames = tests.map((t) => t.testName)
    await api.post(
      `/patients/${patientId}/visits/${visitId}/diagnostic-tests`,
      { tests, testNames }
    )
  },

  async uploadDiagnosticTestReport(
    patientId: string,
    visitId: string,
    testId: string,
    file: File
  ): Promise<void> {
    const formData = new FormData()
    formData.append('file', file)
    await api.post(
      `/patients/${patientId}/visits/${visitId}/diagnostic-tests/${testId}/report`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    )
  },

  async openDiagnosticTestReport(
    patientId: string,
    visitId: string,
    testId: string
  ): Promise<void> {
    const res = await api.get(
      `/patients/${patientId}/visits/${visitId}/diagnostic-tests/${testId}/report/file`,
      { responseType: 'blob' }
    )
    const blob = res.data as Blob
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank', 'noopener,noreferrer')
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  },

  async openDocument(patientId: string, documentId: string): Promise<void> {
    const res = await api.get(
      `/patients/${patientId}/documents/${documentId}/file`,
      { responseType: 'blob' }
    )
    const blob = res.data as Blob
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank', 'noopener,noreferrer')
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  },

  async createVisit(
    patientId: string,
    payload: {
      reason?: string
      notes?: string
      bloodPressureSystolic?: number
      bloodPressureDiastolic?: number
      bloodSugarFasting?: number
      weightKg?: number
      temperature?: number
      otherVitalsNotes?: string
    }
  ): Promise<void> {
    await api.post(`/patients/${patientId}/visit`, payload)
  },

  async referExistingVisit(
    patientId: string,
    visitId: string,
    payload: {
      reason?: string
      notes?: string
      bloodPressureSystolic?: number
      bloodPressureDiastolic?: number
      bloodSugarFasting?: number
      weightKg?: number
      temperature?: number
      otherVitalsNotes?: string
    }
  ): Promise<void> {
    await api.post(`/patients/${patientId}/visit/${visitId}/refer`, payload)
  },

  async uploadDocument(
    patientId: string,
    file: File
  ): Promise<{
    document: {
      id: string
      originalName: string
      mimeType: string
      size: number
      uploadedAt: string
    }
    ocr?:
      | { success: true; text: string; confidence?: number }
      | { success: false; error?: string }
  }> {
    const formData = new FormData()
    formData.append('file', file)
    const res = await api.post(`/patients/${patientId}/documents`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return res.data as any
  },
}

export interface ConsultantOption {
  id: string
  name: string
  clinicLatitude?: number
  clinicLongitude?: number
  clinicAddress?: string
}

export const publicAppointmentService = {
  async listConsultants(): Promise<ConsultantOption[]> {
    const res = await api.get('/public/doctors')
    const data = res.data as { doctors: ConsultantOption[] }
    return data.doctors
  },

  async findPatientByMobile(mobile: string): Promise<PatientSummary | null> {
    try {
      const res = await api.get('/public/patient-by-mobile', { params: { mobile } })
      const data = res.data as { patient: PatientSummary }
      return data.patient
    } catch (err: any) {
      if (err?.response?.status === 404) return null
      throw err
    }
  },

  async bookOldPatientAppointment(payload: {
    mobileNumber: string
    consultationType: string
    consultantId: string
    opdNumber: string
    appointmentDate: string
    preferredSlot?: string
    patientName?: string
    gender?: string
    address?: string
    patientLatitude?: number
    patientLongitude?: number
  }): Promise<{ appointmentId: string; patientId: string }> {
    const res = await api.post('/public/appointments/old', payload)
    return res.data as { appointmentId: string; patientId: string }
  },

  async bookNewPatientAppointment(payload: {
    consultantId: string
    patientName: string
    age?: number
    gender: string
    mobileNumber: string
    city?: string
    address?: string
    appointmentDate: string
    preferredSlot?: string
    patientLatitude?: number
    patientLongitude?: number
  }): Promise<{ appointmentId: string; patientId: string }> {
    const res = await api.post('/public/appointments/new', payload)
    return res.data as { appointmentId: string; patientId: string }
  },
}

