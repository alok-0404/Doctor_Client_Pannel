export type FestivalTheme = 'tricolor' | 'diwali' | 'holi' | 'new-year' | 'generic'

export type FestivalEffect = 'tricolor' | 'confetti' | 'none'

export type FestivalEvent = {
  id: string
  name: string
  /**
   * Inclusive window. Use `YYYY-MM-DD` for a one-off year, or `MM-DD` for an annual recurrence.
   */
  startDate: string
  endDate: string
  greeting: string
  message: string
  theme: FestivalTheme
  effect?: FestivalEffect
  /** Optional CSS background override (gradient or url). */
  banner?: string
  enabled?: boolean
}

/**
 * Add or edit festivals here. Only enabled events whose date window includes today are shown.
 */
export const FESTIVAL_EVENTS: FestivalEvent[] = [
  {
    id: 'independence-day',
    name: 'Independence Day',
    startDate: '08-14',
    endDate: '08-16',
    greeting: 'Happy Independence Day 🇮🇳',
    message: 'Wishing you freedom, health, and a brighter tomorrow. MEDIGRAPH celebrates with the nation.',
    theme: 'tricolor',
    effect: 'tricolor',
    enabled: true,
  },
  {
    id: 'republic-day',
    name: 'Republic Day',
    startDate: '01-25',
    endDate: '01-27',
    greeting: 'Happy Republic Day 🇮🇳',
    message: 'Honouring the Constitution and the spirit of care. Warm wishes from MEDIGRAPH.',
    theme: 'tricolor',
    effect: 'tricolor',
    enabled: true,
  },
  {
    id: 'diwali',
    name: 'Diwali',
    startDate: '11-07',
    endDate: '11-09',
    greeting: 'Happy Diwali',
    message: 'May this festival of lights bring wellness and joy to you and your family.',
    theme: 'diwali',
    effect: 'confetti',
    enabled: true,
  },
]
