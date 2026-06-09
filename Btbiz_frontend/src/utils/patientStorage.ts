const KEY_TOKEN = 'patient_token'
const KEY_PATIENT_ID = 'patient_id'
const KEY_PATIENT_NAME = 'patient_name'
const KEY_AUTH_SOURCE = 'patient_auth_source'

/** How the patient portal session was created. */
export type PatientAuthSource = 'otp' | 'booking'

export const patientStorage = {
  getToken(): string | null {
    return typeof window !== 'undefined' ? sessionStorage.getItem(KEY_TOKEN) : null
  },
  getPatientId(): string | null {
    return typeof window !== 'undefined' ? sessionStorage.getItem(KEY_PATIENT_ID) : null
  },
  getPatientName(): string | null {
    return typeof window !== 'undefined' ? sessionStorage.getItem(KEY_PATIENT_NAME) : null
  },
  getAuthSource(): PatientAuthSource | null {
    if (typeof window === 'undefined') return null
    const raw = sessionStorage.getItem(KEY_AUTH_SOURCE)
    return raw === 'otp' || raw === 'booking' ? raw : null
  },
  /** True only after My Profile login (OTP), not after booking-only session. */
  hasVerifiedPortalLogin(): boolean {
    return !!this.getToken() && this.getAuthSource() === 'otp'
  },
  set(
    token: string,
    patientId: string,
    patientName: string,
    authSource: PatientAuthSource = 'otp'
  ): void {
    if (typeof window === 'undefined') return
    sessionStorage.setItem(KEY_TOKEN, token)
    sessionStorage.setItem(KEY_PATIENT_ID, patientId)
    sessionStorage.setItem(KEY_PATIENT_NAME, patientName)
    sessionStorage.setItem(KEY_AUTH_SOURCE, authSource)
  },
  clear(): void {
    if (typeof window === 'undefined') return
    sessionStorage.removeItem(KEY_TOKEN)
    sessionStorage.removeItem(KEY_PATIENT_ID)
    sessionStorage.removeItem(KEY_PATIENT_NAME)
    sessionStorage.removeItem(KEY_AUTH_SOURCE)
  },
}
