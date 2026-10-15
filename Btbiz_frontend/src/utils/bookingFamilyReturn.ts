const KEY = 'booking_family_return'

export type BookingFamilyReturn = {
  accountId: string
  countryCode: string
  mobileDigits: string
}

export function saveBookingFamilyReturn(data: BookingFamilyReturn): void {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(KEY, JSON.stringify(data))
}

export function peekBookingFamilyReturn(): BookingFamilyReturn | null {
  if (typeof window === 'undefined') return null
  const raw = sessionStorage.getItem(KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as BookingFamilyReturn
    if (!parsed.accountId || !parsed.mobileDigits) return null
    return parsed
  } catch {
    return null
  }
}

export function clearBookingFamilyReturn(): void {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(KEY)
}
