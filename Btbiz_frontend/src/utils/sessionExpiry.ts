export type SessionKind = 'staff' | 'patient'

type Listener = (kind: SessionKind) => void

const listeners = new Set<Listener>()
let activeKind: SessionKind | null = null

/** 401s from these endpoints mean bad credentials / expired share links, not an expired login session. */
const NON_SESSION_401_URL = /\/(login|logout|verify|verify-otp|send-otp|login-or-create)(\?|$)|\/password\/|secure-preview/

export const sessionExpiry = {
  notify(kind: SessionKind): void {
    if (activeKind) return
    activeKind = kind
    listeners.forEach((fn) => fn(kind))
  },
  reset(): void {
    activeKind = null
  },
  subscribe(fn: Listener): () => void {
    listeners.add(fn)
    if (activeKind) fn(activeKind)
    return () => {
      listeners.delete(fn)
    }
  },
}

export function isSessionExpiry401(status: number | undefined, url: string | undefined, hadAuthHeader: boolean): boolean {
  return status === 401 && hadAuthHeader && !NON_SESSION_401_URL.test(url ?? '')
}

/** Reads `exp` (ms since epoch) from a JWT without verifying it; null when absent or unparsable. */
export function getJwtExpiryMs(token: string | null): number | null {
  if (!token) return null
  const payload = token.split('.')[1]
  if (!payload) return null
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    const exp = (JSON.parse(json) as { exp?: unknown }).exp
    return typeof exp === 'number' ? exp * 1000 : null
  } catch {
    return null
  }
}
