import axios from 'axios'
import { authStorage } from '../utils/authStorage'
import { patientStorage } from '../utils/patientStorage'

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

if (import.meta.env.PROD && !API_BASE_URL) {
  // eslint-disable-next-line no-console
  console.warn(
    '[e-Btbiz] VITE_API_BASE_URL is empty. API calls use the same origin as this site. '
      + 'If your backend is on another host (e.g. Replit), set VITE_API_BASE_URL in build secrets and rebuild the frontend.'
  )
}

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

/** API instance for patient portal – uses patient JWT */
export const patientApi = axios.create({
  baseURL: API_BASE_URL,
})

patientApi.interceptors.request.use((config) => {
  const token = patientStorage.getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

function openBlobInBrowser(
  blob: Blob,
  preferredWindow?: Window | null
): void {
  const objectUrl = URL.createObjectURL(blob)
  if (preferredWindow && !preferredWindow.closed) {
    preferredWindow.location.href = objectUrl
  } else {
    // Anchor click fallback is more reliable across Chrome/Edge/Firefox.
    const a = document.createElement('a')
    a.href = objectUrl
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }
  // Keep URL alive for slow PDF/image renderers (notably Firefox).
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
}

export interface DoctorLoginPayload {
  email: string
  password: string
}

export type DoctorRole = 'DOCTOR' | 'ASSISTANT' | 'LAB_ASSISTANT' | 'LAB_MANAGER' | 'PHARMACY' | 'SUPER_ADMIN'

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

export interface SuperAdminListItem {
  id: string
  name: string
  email: string
  phone: string
  status: boolean
  createdAt: string
}

export interface SuperAdminOverview {
  summary: {
    doctors: number
    assistants: number
    labAssistants: number
    pharmacies: number
    labs: number
    diagnostics: number
  }
  lists: {
    doctors: SuperAdminListItem[]
    assistants: SuperAdminListItem[]
    labAssistants: SuperAdminListItem[]
    pharmacies: SuperAdminListItem[]
    labs: SuperAdminListItem[]
  }
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

  async superAdminLogin(payload: DoctorLoginPayload): Promise<DoctorLoginResponse> {
    const res = await api.post('/auth/super-admin/login', payload)
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
      clinicLatitude?: number
      clinicLongitude?: number
      clinicAddress?: string
      dailyOnlineAppointmentLimit?: number | null
      dailyWalkInAppointmentLimit?: number | null
    }
  }> {
    const res = await api.get('/auth/doctor/profile')
    return res.data as any
  },

  async updateDoctorAppointmentLimits(payload: {
    dailyOnlineAppointmentLimit?: number | null
    dailyWalkInAppointmentLimit?: number | null
  }): Promise<void> {
    await api.patch('/auth/doctor/appointment-limits', payload)
  },

  async updateDoctorClinic(payload: {
    clinicLatitude?: number
    clinicLongitude?: number
    clinicAddress?: string
  }): Promise<void> {
    await api.patch('/auth/doctor/clinic', payload)
  },

  async updateDoctorAvailability(payload: {
    availabilityStatus: 'available' | 'unavailable' | 'busy'
    unavailableReason?: string
    unavailableUntil?: string
  }): Promise<{ availabilityStatus: string; unavailableReason?: string; unavailableUntil?: string }> {
    const res = await api.patch('/auth/doctor/availability', payload)
    return res.data
  },

  async getSuperAdminOverview(): Promise<SuperAdminOverview> {
    const res = await api.get('/super-admin/overview')
    return res.data as SuperAdminOverview
  },
}

export interface DoctorNotificationItem {
  id: string
  patientId: string
  patientName: string
  patientMobile?: string
  emergencyContactName?: string
  emergencyContactPhone?: string
  gender?: string
  address?: string
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
  /** Optional source of appointment, e.g. 'WHATSAPP' for bot-created appointments */
  source?: string
  visitDate: string
  reason?: string
  notes?: string
  /** Patient's location at time of booking (if they shared it) */
  patientLatitude?: number
  patientLongitude?: number
  /** Distance in km from patient's booking location to doctor's clinic */
  distanceKm?: number
}

export interface AssistantCheckedInItem extends DoctorAppointmentItem {
  checkedInAt: string
}

export interface PharmacyOrderRequest {
  id: string
  requestGroupId?: string
  patientId: string
  patientName: string
  patientMobile: string
  medicineName: string
  medicineNames?: string[]
  medicines?: Array<{ medicineName: string; dosage?: string; quantity?: number; notes?: string }>
  dosage?: string
  quantity?: number
  notes?: string
  serviceType: 'PICKUP' | 'HOME_DELIVERY'
  paymentMode: 'ONLINE' | 'OFFLINE'
  paymentStatus: 'PENDING' | 'PAID'
  status: 'PENDING' | 'ACCEPTED' | 'COMPLETED' | 'CANCELLED'
  expectedFulfillmentMinutes?: number
  fulfilledAt?: string
  receiptNumber?: string
  paidAt?: string
  createdAt: string
}

export interface LabOrderRequest {
  id: string
  requestGroupId?: string
  patientId: string
  patientName: string
  patientMobile: string
  testName: string
  testNames?: string[]
  notes?: string
  serviceType: 'LAB_VISIT' | 'HOME_SERVICE'
  paymentMode: 'ONLINE' | 'OFFLINE'
  paymentStatus: 'PENDING' | 'PAID'
  status: 'PENDING' | 'ACCEPTED' | 'COMPLETED' | 'CANCELLED'
  preferredDateTime?: string
  expectedFulfillmentMinutes?: number
  fulfilledAt?: string
  receiptNumber?: string
  paidAt?: string
  createdAt: string
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

export interface AssistantFamilyOption {
  id: string
  firstName: string
  lastName?: string
  mobileNumber?: string
}

export interface AssistantPatientPrefill {
  patient: PatientSummary | null
  latestVisit: {
    id: string
    visitDate: string
    reason?: string
    notes?: string
  } | null
  /** Present when several profiles share this mobile — choose one and call prefill again with patientId. */
  familyOptions?: AssistantFamilyOption[]
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

  /** For assistant: linked doctor's upcoming appointments (after today). */
  async getAssistantDoctorUpcomingAppointments(): Promise<{ doctorId: string; appointments: DoctorAppointmentItem[]; total: number }> {
    const res = await api.get('/appointments/assistant/doctor-upcoming')
    const data = res.data as { doctorId: string; appointments: DoctorAppointmentItem[]; total: number }
    return data
  },

  /** For assistant audit: today's already checked-in patients. */
  async getAssistantCheckedInToday(): Promise<{ doctorId: string; checkedIn: AssistantCheckedInItem[] }> {
    const res = await api.get('/appointments/assistant/checked-in-today')
    const data = res.data as { doctorId: string; checkedIn: AssistantCheckedInItem[] }
    return data
  },

  /** For assistant check-in desk: prefill patient + latest visit (works for bot-created appointments too). Pass patientId when multiple family members share the mobile. */
  async getAssistantPatientPrefill(mobile: string, patientId?: string, visitId?: string): Promise<AssistantPatientPrefill> {
    const params: Record<string, string> = { mobile }
    if (patientId) params.patientId = patientId
    if (visitId) params.visitId = visitId
    const res = await api.get('/appointments/assistant/patient-prefill', {
      params,
    })
    return res.data as AssistantPatientPrefill
  },
}

export const orderService = {
  async getMedicineRequests(): Promise<PharmacyOrderRequest[]> {
    const res = await api.get('/orders/medicine-requests')
    return (res.data as { requests: PharmacyOrderRequest[] }).requests ?? []
  },
  async updateMedicineRequest(
    requestId: string,
    payload: Partial<{
      status: 'PENDING' | 'ACCEPTED' | 'COMPLETED' | 'CANCELLED'
      paymentStatus: 'PENDING' | 'PAID'
      expectedFulfillmentMinutes: number
      receiptNumber: string
      paidAt: string
      subtotal: number
      totalDiscount: number
      totalAmount: number
      paidAmount: number
    }>
  ): Promise<void> {
    await api.patch(`/orders/medicine-requests/${requestId}`, payload)
  },
  async getTestRequests(): Promise<LabOrderRequest[]> {
    const res = await api.get('/orders/test-requests')
    return (res.data as { requests: LabOrderRequest[] }).requests ?? []
  },
  async updateTestRequest(
    requestId: string,
    payload: Partial<{
      status: 'PENDING' | 'ACCEPTED' | 'COMPLETED' | 'CANCELLED'
      paymentStatus: 'PENDING' | 'PAID'
      expectedFulfillmentMinutes: number
    }>
  ): Promise<void> {
    await api.patch(`/orders/test-requests/${requestId}`, payload)
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

export const patientAuthService = {
  async sendOtp(mobile: string): Promise<void> {
    await api.post('/public/patient/send-otp', { mobile })
  },
  async verify(mobile: string, otp: string): Promise<
    | { token: string; patient: { id: string; firstName: string; lastName?: string } }
    | { selectionToken: string; patients: Array<{ id: string; firstName: string; lastName?: string }> }
  > {
    const res = await api.post('/public/patient/verify', { mobile, otp })
    return res.data
  },
  async selectProfile(selectionToken: string, patientId: string): Promise<{
    token: string
    patient: { id: string; firstName: string; lastName?: string }
  }> {
    const res = await api.post('/public/patient/select-profile', {
      selectionToken,
      patientId,
    })
    return res.data
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
    source?: 'patient' | 'staff'
    isFileAvailable?: boolean
  }>
  medicineRequests?: Array<{
    id: string
    medicineName: string
    dosage?: string
    quantity?: number
    notes?: string
    source?: string
    serviceType?: 'PICKUP' | 'HOME_DELIVERY'
    paymentMode?: 'ONLINE' | 'OFFLINE'
    paymentStatus?: 'PENDING' | 'PAID'
    status?: 'PENDING' | 'ACCEPTED' | 'COMPLETED' | 'CANCELLED'
    expectedFulfillmentMinutes?: number
    fulfilledAt?: string
    receiptNumber?: string
    paidAt?: string
    subtotal?: number
    totalDiscount?: number
    totalAmount?: number
    paidAmount?: number
    preferredProviderId?: string
    preferredProviderName?: string
    preferredProviderAddress?: string
    createdAt: string
  }>
  testRequests?: Array<{
    id: string
    testName: string
    notes?: string
    source?: string
    serviceType?: 'LAB_VISIT' | 'HOME_SERVICE'
    paymentMode?: 'ONLINE' | 'OFFLINE'
    paymentStatus?: 'PENDING' | 'PAID'
    status?: 'PENDING' | 'ACCEPTED' | 'COMPLETED' | 'CANCELLED'
    preferredDateTime?: string
    expectedFulfillmentMinutes?: number
    fulfilledAt?: string
    receiptNumber?: string
    paidAt?: string
    preferredProviderId?: string
    preferredProviderName?: string
    preferredProviderAddress?: string
    createdAt: string
  }>
}

export interface ServiceProviderOption {
  id: string
  name: string
  role: 'PHARMACY' | 'LAB_MANAGER' | 'LAB_ASSISTANT'
  clinicAddress?: string
  clinicLatitude?: number
  clinicLongitude?: number
  distanceKm?: number
}

export const patientPortalService = {
  async getProfile(): Promise<FullPatientHistory> {
    const res = await patientApi.get('/public/patient/profile')
    return res.data as FullPatientHistory
  },
  async uploadDocument(file: File): Promise<{ document: { id: string; originalName: string; uploadedAt: string } }> {
    const formData = new FormData()
    formData.append('file', file)
    const res = await patientApi.post('/public/patient/documents', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return res.data as any
  },
  async addMedicine(payload: {
    medicineName: string
    dosage?: string
    quantity?: number
    notes?: string
    serviceType?: 'PICKUP' | 'HOME_DELIVERY'
    paymentMode?: 'ONLINE' | 'OFFLINE'
    expectedFulfillmentMinutes?: number
    preferredProviderId?: string
  }): Promise<{ medicine: { id: string; medicineName: string } }> {
    const res = await patientApi.post('/public/patient/medicines', payload)
    return res.data as any
  },
  async addTest(payload: {
    testName: string
    notes?: string
    serviceType?: 'LAB_VISIT' | 'HOME_SERVICE'
    paymentMode?: 'ONLINE' | 'OFFLINE'
    preferredDateTime?: string
    expectedFulfillmentMinutes?: number
    preferredProviderId?: string
  }): Promise<{
    test: { id: string; testName: string }
  }> {
    const res = await patientApi.post('/public/patient/tests', payload)
    return res.data as any
  },
  async getServiceProviders(kind: 'pharmacy' | 'lab', lat?: number, lng?: number): Promise<ServiceProviderOption[]> {
    const res = await patientApi.get('/public/patient/providers', {
      params: {
        kind,
        ...(typeof lat === 'number' ? { lat } : {}),
        ...(typeof lng === 'number' ? { lng } : {}),
      },
    })
    return ((res.data as any)?.providers ?? []) as ServiceProviderOption[]
  },
  async openDocument(documentId: string, patientId?: string): Promise<void> {
    // Open tab in user-click context first, otherwise popup blockers may block blob preview.
    const previewWin = window.open('', '_blank')
    if (previewWin) {
      previewWin.document.write(`
        <html><head><title>Loading…</title><meta charset="utf-8" /></head>
        <body style="margin:0;padding:16px;background:#f8fafc;color:#0f172a;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;">
          <h2 style="margin:0 0 8px;">Loading document…</h2>
          <p style="margin:0;font-size:13px;color:#475569;">Preparing preview.</p>
        </body></html>
      `)
      previewWin.document.close()
    }
    try {
      const resolvedPatientId = patientId || patientStorage.getPatientId()
      if (resolvedPatientId) {
        const linkRes = await patientApi.get('/public/patient/documents/link', {
          params: { patientId: resolvedPatientId, documentId },
        })
        const tokenizedUrl = (linkRes.data as { url?: string })?.url
        if (tokenizedUrl) {
          if (previewWin) {
            previewWin.location.href = tokenizedUrl
          } else {
            window.open(tokenizedUrl, '_blank', 'noopener,noreferrer')
          }
          return
        }
      }

      // Fallback: try authenticated blob route when short-link route is unavailable.
      const fileRes = await patientApi.get(`/public/patient/documents/${documentId}/file`, { responseType: 'blob' })
      const blob = fileRes.data as Blob
      openBlobInBrowser(blob, previewWin)
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: Blob | { message?: string } } }
      let msg = 'Could not open document. Please try again.'
      if (e?.response?.status === 404) {
        msg = 'Document file not found.'
      } else if (e?.response?.status === 403) {
        msg = 'You are not allowed to view this document.'
      } else if (e?.response?.status === 401) {
        msg = 'Your session expired. Please login again.'
      } else if (e?.response?.data instanceof Blob) {
        try {
          const text = await e.response.data.text()
          const j = JSON.parse(text) as { message?: string }
          if (j.message) msg = j.message
        } catch {
          /* ignore parse errors */
        }
      } else if (e?.response?.data && typeof (e.response.data as { message?: string }).message === 'string') {
        msg = (e.response.data as { message: string }).message
      }
      if (previewWin && !previewWin.closed) previewWin.close()
      // eslint-disable-next-line no-alert
      alert(msg)
    }
  },
  async openDiagnosticReport(visitId: string, testId: string): Promise<void> {
    // Open tab in user-click context first, then stream report blob into it.
    const previewWin = window.open('', '_blank')
    if (previewWin) {
      previewWin.document.write(`
        <html><head><title>Loading…</title><meta charset="utf-8" /></head>
        <body style="margin:0;padding:16px;background:#f8fafc;color:#0f172a;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;">
          <h2 style="margin:0 0 8px;">Loading report…</h2>
          <p style="margin:0;font-size:13px;color:#475569;">Preparing report preview.</p>
        </body></html>
      `)
      previewWin.document.close()
    }
    try {
      const res = await patientApi.get(
        `/public/patient/visits/${visitId}/diagnostic-tests/${testId}/report/file`,
        { responseType: 'blob' }
      )
      const blob = res.data as Blob
      const ct = (res.headers['content-type'] || '').toString().toLowerCase()
      if (ct.includes('application/json') || (blob.type && blob.type.includes('json'))) {
        const text = await blob.text()
        try {
          const j = JSON.parse(text) as { message?: string }
          if (previewWin && !previewWin.closed) previewWin.close()
          // eslint-disable-next-line no-alert
          alert(j.message ?? 'Could not open report.')
        } catch {
          if (previewWin && !previewWin.closed) previewWin.close()
          // eslint-disable-next-line no-alert
          alert('Could not open report.')
        }
        return
      }
      openBlobInBrowser(blob, previewWin)
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: Blob | { message?: string } } }
      let msg = 'Could not open report. If payment is pending, complete payment first.'
      if (e?.response?.status === 404) {
        msg = 'Report file not found. The lab may need to upload the report again.'
      } else if (e?.response?.status === 403) {
        msg = 'Payment must be completed before viewing this report.'
      } else if (e?.response?.data instanceof Blob) {
        try {
          const text = await e.response.data.text()
          const j = JSON.parse(text) as { message?: string }
          if (j.message) msg = j.message
        } catch {
          /* ignore */
        }
      } else if (e?.response?.data && typeof (e.response.data as { message?: string }).message === 'string') {
        msg = (e.response.data as { message: string }).message
      }
      if (previewWin && !previewWin.closed) previewWin.close()
      // eslint-disable-next-line no-alert
      alert(msg)
    }
  },
}

export const patientService = {
  async searchByMobileOptions(mobile: string): Promise<PatientSummary[]> {
    try {
      const res = await api.get('/patients/search', { params: { mobile } })
      const data = res.data as { patient?: PatientSummary; patients?: PatientSummary[] }
      if (Array.isArray(data.patients) && data.patients.length > 0) return data.patients
      return data.patient ? [data.patient] : []
    } catch (err: any) {
      if (err?.response?.status === 404) return []
      throw err
    }
  },
  async searchByMobile(mobile: string): Promise<PatientSummary | null> {
    const options = await this.searchByMobileOptions(mobile)
    return options[0] ?? null
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
    openBlobInBrowser(blob)
  },

  async openDocument(patientId: string, documentId: string): Promise<void> {
    // Open preview window immediately in user-gesture context to avoid popup blockers.
    const previewWin = window.open('', '_blank')
    if (previewWin) {
      previewWin.document.write(`
        <html><head><title>Loading…</title><meta charset="utf-8" /></head>
        <body style="margin:0;padding:16px;background:#f8fafc;color:#0f172a;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;">
          <h2 style="margin:0 0 8px;">Loading…</h2>
          <p style="margin:0;font-size:13px;color:#475569;">Preparing document preview.</p>
        </body></html>
      `)
      previewWin.document.close()
    }

    const currentRole = authStorage.getRole()
    const mustUseSecurePreview =
      currentRole === 'LAB_ASSISTANT' || currentRole === 'LAB_MANAGER' || currentRole === 'PHARMACY'

    const openSecurePreview = async (): Promise<void> => {
      const escapeHtml = (v: string): string =>
        v
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;')

      const win = previewWin ?? window.open('', '_blank')
      if (!win) {
        alert('Popup blocked. Please allow popups to view secure preview.')
        return
      }

      win.document.write(`
        <html><head><title>Secure prescription preview</title><meta charset="utf-8" /></head>
        <body style="margin:0;padding:16px;background:#f8fafc;color:#0f172a;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;">
          <h2 style="margin:0 0 8px;">Secure prescription preview</h2>
          <p style="margin:0;font-size:13px;color:#475569;">Loading secure content…</p>
        </body></html>
      `)
      win.document.close()

      try {
        const linkRes = await api.get(`/patients/${patientId}/documents/${documentId}/secure-link`)
        const token = (linkRes.data as { token: string }).token
        // Prefer POST so JWT is not in URL path. Fallback to legacy GET for old deployments.
        let previewRes
        try {
          previewRes = await api.post('/patients/documents/secure-preview', { token })
        } catch (postErr: any) {
          if (postErr?.response?.status !== 404) throw postErr
          previewRes = await api.get(`/patients/documents/secure-preview/${token}`)
        }
        const payload = previewRes.data as {
          document: {
            originalName: string
            uploadedAt?: string
            previewText: string
            scope: string
            roleView?: string
            lowConfidenceLines?: string[]
            parsed?: {
              medicines?: Array<{ text: string; confidence: 'HIGH' | 'MEDIUM' | 'LOW' }>
              tests?: Array<{ text: string; confidence: 'HIGH' | 'MEDIUM' | 'LOW' }>
              unknown?: Array<{ text: string; confidence: 'HIGH' | 'MEDIUM' | 'LOW' }>
            }
          }
        }

        const uploaded = payload.document.uploadedAt
          ? new Date(payload.document.uploadedAt).toLocaleString('en-IN')
          : '—'

        const renderRows = (rows: Array<{ text: string; confidence: 'HIGH' | 'MEDIUM' | 'LOW' }> | undefined) =>
          (rows ?? [])
            .map((r) => {
              const color =
                r.confidence === 'HIGH' ? '#166534' : r.confidence === 'MEDIUM' ? '#92400e' : '#991b1b'
              return `<li style="margin:0 0 6px;">
                <span>${escapeHtml(r.text)}</span>
                <small style="margin-left:8px;color:${color};font-weight:600;">${escapeHtml(r.confidence)}</small>
              </li>`
            })
            .join('')

        const medicinesHtml = renderRows(payload.document.parsed?.medicines)
        const testsHtml = renderRows(payload.document.parsed?.tests)
        const lowLines = (payload.document.lowConfidenceLines ?? [])
          .map((l) => `<li style="margin:0 0 4px;color:#991b1b;">${escapeHtml(l)}</li>`)
          .join('')

        win.document.open()
        win.document.write(`
          <html>
            <head>
              <title>Secure prescription preview</title>
              <meta charset="utf-8" />
            </head>
            <body style="margin:0;padding:16px;background:#f8fafc;color:#0f172a;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;">
              <h2 style="margin:0 0 8px;">Secure prescription preview</h2>
              <p style="margin:0 0 4px;font-size:13px;color:#475569;"><strong>File:</strong> ${escapeHtml(payload.document.originalName || 'Prescription')}</p>
              <p style="margin:0 0 12px;font-size:13px;color:#475569;"><strong>Uploaded:</strong> ${escapeHtml(uploaded)} · <strong>Scope:</strong> ${escapeHtml(payload.document.scope || 'OCR_ONLY')}</p>
              <p style="margin:0 0 8px;font-size:12px;color:#b45309;background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:8px 10px;">
                Download is disabled for this role. Only limited preview is shown.
              </p>
              <p style="margin:0 0 10px;font-size:12px;color:#334155;"><strong>Role filter:</strong> ${escapeHtml(payload.document.roleView || 'ROLE_FILTERED')}</p>

              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
                <section style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:10px;">
                  <h3 style="margin:0 0 8px;font-size:13px;">Parsed medicines (pharmacy view)</h3>
                  <ul style="margin:0;padding-left:16px;font-size:12px;line-height:1.45;">
                    ${medicinesHtml || '<li style="color:#64748b;">No medicine lines available for this role.</li>'}
                  </ul>
                </section>
                <section style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:10px;">
                  <h3 style="margin:0 0 8px;font-size:13px;">Parsed tests (lab view)</h3>
                  <ul style="margin:0;padding-left:16px;font-size:12px;line-height:1.45;">
                    ${testsHtml || '<li style="color:#64748b;">No test lines available for this role.</li>'}
                  </ul>
                </section>
              </div>

              <section style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:10px;margin-bottom:10px;">
                <h3 style="margin:0 0 8px;font-size:13px;">Low-confidence lines (verify manually)</h3>
                <ul style="margin:0;padding-left:16px;font-size:12px;line-height:1.4;">
                  ${lowLines || '<li style="color:#64748b;">No low-confidence lines.</li>'}
                </ul>
              </section>

              <h3 style="margin:0 0 8px;font-size:13px;">Raw OCR</h3>
              <pre style="white-space:pre-wrap;word-break:break-word;font-size:13px;line-height:1.5;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:12px;">${escapeHtml(payload.document.previewText || '')}</pre>
            </body>
          </html>
        `)
        win.document.close()
      } catch (previewErr: any) {
        const msg =
          previewErr?.response?.data?.message ??
          'Secure preview could not be loaded. Please try again.'
        win.document.open()
        win.document.write(`
          <html><head><title>Secure prescription preview</title><meta charset="utf-8" /></head>
          <body style="margin:0;padding:16px;background:#f8fafc;color:#0f172a;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;">
            <h2 style="margin:0 0 8px;">Secure prescription preview</h2>
            <p style="margin:0;font-size:13px;color:#991b1b;">${escapeHtml(msg)}</p>
          </body></html>
        `)
        win.document.close()
      }
    }

    if (mustUseSecurePreview) {
      await openSecurePreview()
      return
    }

    if (!mustUseSecurePreview) {
      try {
        // Prefer tokenized public URL first for doctor/assistant flows.
        const linkRes = await api.get('/public/patient/documents/link', {
          params: { patientId, documentId },
        })
        const tokenizedUrl = (linkRes.data as { url?: string })?.url
        if (tokenizedUrl) {
          if (previewWin) {
            previewWin.location.href = tokenizedUrl
          } else {
            window.open(tokenizedUrl, '_blank', 'noopener,noreferrer')
          }
          return
        }
      } catch {
        // Ignore and fallback to authenticated/secure flow.
      }
    }

    try {
      const res = await api.get(
        `/patients/${patientId}/documents/${documentId}/file`,
        {
          responseType: 'blob',
          params: { _ts: Date.now() },
          headers: {
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache',
          },
        }
      )
      const blob = res.data as Blob
      const url = URL.createObjectURL(blob)
      if (previewWin) {
        previewWin.location.href = url
      } else {
        window.open(url, '_blank', 'noopener,noreferrer')
      }
      // Keep blob URL alive longer; short revoke can render blank tab for PDFs/images.
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (err: any) {
      const forbidden = err?.response?.status === 403
      if (!forbidden) {
        throw err
      }

      await openSecurePreview()
    }
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

export interface FamilyAccountSummary {
  id: string
  phone: string
}

export type FamilyRelation =
  | 'SELF'
  | 'SPOUSE'
  | 'SON'
  | 'DAUGHTER'
  | 'FATHER'
  | 'MOTHER'
  | 'BROTHER'
  | 'SISTER'
  | 'OTHER'

export interface FamilyMemberSummary {
  id: string
  fullName: string
  relation: FamilyRelation
  gender?: string
  dateOfBirth?: string
  patientId: string | null
  patient: PatientSummary | null
}

export interface FamilyMemberHistory {
  member: {
    id: string
    fullName: string
    relation: FamilyRelation
    gender?: string
    dateOfBirth?: string
    patient: PatientSummary
  }
  visits: Array<{
    id: string
    visitDate: string
    reason?: string
    notes?: string
    doctorName?: string
  }>
}

export interface DoctorAppointmentQuotaSnapshot {
  online: { limit: number | null; booked: number; remaining: number | null }
  walkIn: { limit: number | null; booked: number; remaining: number | null }
}

export const publicAppointmentService = {
  async listConsultants(): Promise<ConsultantOption[]> {
    const res = await api.get('/public/doctors')
    const data = res.data as { doctors: ConsultantOption[] }
    return data.doctors
  },

  async getAppointmentQuota(doctorId: string, dateYyyyMmDd: string): Promise<DoctorAppointmentQuotaSnapshot> {
    const res = await api.get(`/public/doctors/${doctorId}/appointment-quota`, {
      params: { date: dateYyyyMmDd },
    })
    return res.data as DoctorAppointmentQuotaSnapshot
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

  async familyLoginOrCreate(mobileNumber: string): Promise<FamilyAccountSummary> {
    const res = await api.post('/public/family/login-or-create', { mobileNumber })
    const data = res.data as { account: FamilyAccountSummary }
    return data.account
  },

  async listFamilyMembers(params: { mobile?: string; accountId?: string }): Promise<{
    account: FamilyAccountSummary
    members: FamilyMemberSummary[]
  }> {
    const res = await api.get('/public/family/members', { params })
    return res.data as any
  },

  async addFamilyMember(payload: {
    accountId: string
    fullName: string
    relation: FamilyRelation
    gender?: 'MALE' | 'FEMALE' | 'OTHER'
    dateOfBirth?: string
    address?: string
  }): Promise<{ member: { id: string; fullName: string; relation: FamilyRelation; patientId: string } }> {
    const res = await api.post('/public/family/members', payload)
    return res.data as any
  },

  async updateFamilyMember(
    memberId: string,
    payload: Partial<{
      fullName: string
      relation: FamilyRelation
      gender: 'MALE' | 'FEMALE' | 'OTHER'
      dateOfBirth: string
      address: string
    }>
  ): Promise<void> {
    await api.patch(`/public/family/members/${memberId}`, payload)
  },

  async deleteFamilyMember(memberId: string): Promise<void> {
    await api.delete(`/public/family/members/${memberId}`)
  },

  async getFamilyMemberHistory(memberId: string): Promise<FamilyMemberHistory> {
    const res = await api.get(`/public/family/member-history/${memberId}`)
    return res.data as any
  },

  async getFamilyMemberProfileToken(accountId: string, memberId: string): Promise<{
    token: string
    patient: { id: string; firstName: string; lastName?: string }
  }> {
    const res = await api.post('/public/family/member-profile-token', {
      accountId,
      memberId,
    })
    return res.data as any
  },

  async bookFamilyAppointment(payload: {
    patientId: string
    consultantId: string
    appointmentDate: string
    preferredSlot?: string
    consultationType?: string
    opdNumber?: string
    patientName?: string
    gender?: string
    address?: string
    patientLatitude?: number
    patientLongitude?: number
  }): Promise<{ appointmentId: string; patientId: string }> {
    const res = await api.post('/public/appointments/family', payload)
    return res.data as any
  },

  async updateAppointmentLiveLocation(payload: {
    appointmentId: string
    patientLatitude: number
    patientLongitude: number
    accuracyMeters?: number
  }): Promise<void> {
    await api.patch(`/public/appointments/${payload.appointmentId}/location`, {
      patientLatitude: payload.patientLatitude,
      patientLongitude: payload.patientLongitude,
      accuracyMeters: payload.accuracyMeters,
    })
  },
}

