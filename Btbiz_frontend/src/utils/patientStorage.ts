const KEY_TOKEN = 'patient_token'
const KEY_PATIENT_ID = 'patient_id'
const KEY_PATIENT_NAME = 'patient_name'

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
  set(token: string, patientId: string, patientName: string): void {
    if (typeof window === 'undefined') return
    sessionStorage.setItem(KEY_TOKEN, token)
    sessionStorage.setItem(KEY_PATIENT_ID, patientId)
    sessionStorage.setItem(KEY_PATIENT_NAME, patientName)
  },
  clear(): void {
    if (typeof window === 'undefined') return
    sessionStorage.removeItem(KEY_TOKEN)
    sessionStorage.removeItem(KEY_PATIENT_ID)
    sessionStorage.removeItem(KEY_PATIENT_NAME)
  },
}
