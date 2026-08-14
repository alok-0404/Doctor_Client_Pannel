import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { FESTIVAL_EVENTS, type FestivalEffect, type FestivalEvent } from '../constants/festivalEvents'
import { getActiveFestival } from '../utils/activeFestival'
import { festivalPopupStorage } from '../utils/festivalPopupStorage'

const CLOSE_MS = 280
const AFTERGLOW_MS = 4200

type Phase = 'closed' | 'open' | 'closing' | 'afterglow'

function particlesFor(effect: FestivalEffect | undefined, count: number) {
  const palette =
    effect === 'tricolor'
      ? ['#FF9933', '#FFFFFF', '#138808']
      : ['#0E8F7E', '#14B8A6', '#FF9933', '#F8FAFC', '#0F172A']

  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left: `${(i * 37 + 11) % 100}%`,
    delay: `${(i % 8) * 0.08}s`,
    duration: `${1.6 + (i % 5) * 0.18}s`,
    color: palette[i % palette.length],
    size: 6 + (i % 4) * 2,
  }))
}

export const FestivalCelebration = () => {
  const titleId = useId()
  const event = useMemo(() => getActiveFestival(FESTIVAL_EVENTS), [])
  const year = new Date().getFullYear()
  const [phase, setPhase] = useState<Phase>('closed')
  const closeTimer = useRef<number | null>(null)
  const glowTimer = useRef<number | null>(null)

  useEffect(() => {
    if (!event) return
    if (festivalPopupStorage.hasDismissed(event.id, year)) return
    const id = window.setTimeout(() => setPhase('open'), 180)
    return () => window.clearTimeout(id)
  }, [event, year])

  const finishClose = useCallback(
    (active: FestivalEvent) => {
      festivalPopupStorage.markDismissed(active.id, year)
      setPhase('afterglow')
      glowTimer.current = window.setTimeout(() => setPhase('closed'), AFTERGLOW_MS)
    },
    [year]
  )

  const handleClose = useCallback(() => {
    if (!event || phase !== 'open') return
    setPhase('closing')
    closeTimer.current = window.setTimeout(() => finishClose(event), CLOSE_MS)
  }, [event, finishClose, phase])

  useEffect(() => {
    return () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current)
      if (glowTimer.current) window.clearTimeout(glowTimer.current)
    }
  }, [])

  useEffect(() => {
    if (phase !== 'open') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [handleClose, phase])

  if (!event || phase === 'closed') return null

  const effect = event.effect ?? 'none'
  const popupParticles = particlesFor(effect === 'none' ? 'confetti' : effect, 18)
  const afterglowParticles = particlesFor(effect === 'none' ? 'confetti' : effect, 22)

  return (
    <>
      {(phase === 'open' || phase === 'closing') && (
        <div
          className={`festival-popup-backdrop${phase === 'closing' ? ' festival-popup-backdrop--closing' : ''}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <div
            className={`festival-popup-card festival-popup-card--${event.theme}${phase === 'closing' ? ' festival-popup-card--closing' : ''}`}
            style={event.banner ? { backgroundImage: event.banner } : undefined}
          >
            <button
              type="button"
              className="festival-popup-close"
              onClick={handleClose}
              aria-label="Close festival greeting"
            >
              <span aria-hidden="true">×</span>
            </button>

            <div className="festival-popup-visual" aria-hidden="true">
              {event.theme === 'tricolor' && (
                <div className="festival-tricolor-flag">
                  <span />
                  <span />
                  <span />
                </div>
              )}
              {event.theme === 'diwali' && <div className="festival-diwali-glow" />}
              {event.theme === 'holi' && <div className="festival-holi-wash" />}
              {event.theme === 'new-year' && <div className="festival-newyear-spark" />}
              <div className="festival-popup-sparkles">
                {popupParticles.map((p) => (
                  <span
                    key={p.id}
                    className="festival-sparkle"
                    style={{
                      left: p.left,
                      animationDelay: p.delay,
                      width: p.size,
                      height: p.size,
                      background: p.color,
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="festival-popup-copy">
              <p className="festival-popup-kicker">{event.name}</p>
              <h2 id={titleId} className="festival-popup-title">
                {event.greeting}
              </h2>
              <p className="festival-popup-message">{event.message}</p>
            </div>
          </div>
        </div>
      )}

      {phase === 'afterglow' && effect !== 'none' && (
        <div className="festival-afterglow" aria-hidden="true">
          {effect === 'tricolor' && (
            <div className="festival-afterglow-flag">
              <span />
              <span />
              <span />
            </div>
          )}
          <p className="festival-afterglow-caption">{event.greeting}</p>
          {afterglowParticles.map((p) => (
            <span
              key={p.id}
              className="festival-afterglow-particle"
              style={{
                left: p.left,
                animationDelay: p.delay,
                animationDuration: p.duration,
                width: p.size,
                height: p.size,
                background: p.color,
              }}
            />
          ))}
        </div>
      )}
    </>
  )
}
