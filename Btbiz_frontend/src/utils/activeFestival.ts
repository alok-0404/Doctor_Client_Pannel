import type { FestivalEvent } from '../constants/festivalEvents'

function parseDatePart(value: string): { month: number; day: number; year?: number } | null {
  const trimmed = value.trim()
  const full = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed)
  if (full) {
    return { year: Number(full[1]), month: Number(full[2]), day: Number(full[3]) }
  }
  const annual = /^(\d{2})-(\d{2})$/.exec(trimmed)
  if (annual) {
    return { month: Number(annual[1]), day: Number(annual[2]) }
  }
  return null
}

function toOrdinal(year: number, month: number, day: number): number {
  return Date.UTC(year, month - 1, day)
}

/**
 * Returns the first enabled event whose inclusive start–end window contains `now` (local calendar date).
 */
export function getActiveFestival(events: FestivalEvent[], now = new Date()): FestivalEvent | null {
  const y = now.getFullYear()
  const today = toOrdinal(y, now.getMonth() + 1, now.getDate())

  for (const event of events) {
    if (event.enabled === false) continue
    const start = parseDatePart(event.startDate)
    const end = parseDatePart(event.endDate)
    if (!start || !end) continue

    const startYear = start.year ?? y
    const endYear = end.year ?? (start.year ?? y)

    let startOrd = toOrdinal(startYear, start.month, start.day)
    let endOrd = toOrdinal(endYear, end.month, end.day)

    if (!start.year && !end.year && endOrd < startOrd) {
      if (today >= startOrd) {
        endOrd = toOrdinal(y + 1, end.month, end.day)
      } else {
        startOrd = toOrdinal(y - 1, start.month, start.day)
      }
    }

    if (today >= startOrd && today <= endOrd) {
      return event
    }
  }

  return null
}
