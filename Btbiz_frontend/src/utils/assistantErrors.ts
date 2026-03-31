/**
 * Maps API errors when assistant registers a walk-in visit (POST /patients/:id/visit).
 * 409 = daily walk-in quota full for the doctor (IST day).
 */
export function parseAssistantReferralError(err: unknown): {
  message: string
  variant: 'quota' | 'standard'
} {
  const e = err as
    | {
        response?: { status?: number; data?: { message?: string } }
      }
    | undefined
  const status = e?.response?.status
  const raw = e?.response?.data?.message
  const serverMsg = typeof raw === 'string' && raw.trim() ? raw.trim() : ''

  if (status === 409) {
    return {
      variant: 'quota',
      message:
        serverMsg ||
        'Walk-in capacity for this doctor is full for today. The doctor can increase the daily walk-in limit in their dashboard, or you can try again tomorrow.',
    }
  }

  if (serverMsg) {
    return { variant: 'standard', message: serverMsg }
  }

  return {
    variant: 'standard',
    message: 'Could not register this visit. Please check your connection and try again.',
  }
}
