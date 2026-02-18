/**
 * Auth data is stored in sessionStorage (per-tab) so that when one tab logs in
 * as a different role (e.g. Assistant), it does not overwrite the Doctor's
 * session in another tab. Otherwise the doctor panel would sometimes switch
 * to assistant/lab panel.
 */
const KEY_TOKEN = 'doctor_token'
const KEY_NAME = 'doctor_name'
const KEY_ROLE = 'doctor_role'

export const authStorage = {
  getToken(): string | null {
    return typeof window !== 'undefined' ? sessionStorage.getItem(KEY_TOKEN) : null
  },
  getName(): string | null {
    return typeof window !== 'undefined' ? sessionStorage.getItem(KEY_NAME) : null
  },
  getRole(): string | null {
    return typeof window !== 'undefined' ? sessionStorage.getItem(KEY_ROLE) : null
  },
  set(token: string, name: string, role: string): void {
    if (typeof window === 'undefined') return
    sessionStorage.setItem(KEY_TOKEN, token)
    sessionStorage.setItem(KEY_NAME, name)
    sessionStorage.setItem(KEY_ROLE, role)
  },
  clear(): void {
    if (typeof window === 'undefined') return
    sessionStorage.removeItem(KEY_TOKEN)
    sessionStorage.removeItem(KEY_NAME)
    sessionStorage.removeItem(KEY_ROLE)
  },
}
