const KEY = 'medigraph_festival_dismissed'

function readIds(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : []
  } catch {
    return []
  }
}

export const festivalPopupStorage = {
  dismissalKey(eventId: string, year: number): string {
    return `${eventId}:${year}`
  },
  hasDismissed(eventId: string, year: number): boolean {
    const token = this.dismissalKey(eventId, year)
    return readIds().includes(token)
  },
  markDismissed(eventId: string, year: number): void {
    if (typeof window === 'undefined') return
    const token = this.dismissalKey(eventId, year)
    const next = Array.from(new Set([...readIds(), token]))
    window.localStorage.setItem(KEY, JSON.stringify(next))
  },
}
