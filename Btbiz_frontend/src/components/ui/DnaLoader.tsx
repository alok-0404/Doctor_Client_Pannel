import { useEffect, useState } from 'react'

interface DnaLoaderProps {
  label?: string
  size?: number
  /** Spinner appears only if still mounted after this delay (avoids flash on fast API calls). */
  delayMs?: number
}

/** Lightweight CSS spinner — replaces the old heavy DNA animation. */
export const DnaLoader = ({ label = 'Loading...', size = 36, delayMs = 180 }: DnaLoaderProps) => {
  const [visible, setVisible] = useState(delayMs <= 0)

  useEffect(() => {
    if (delayMs <= 0) {
      setVisible(true)
      return
    }
    const timer = window.setTimeout(() => setVisible(true), delayMs)
    return () => window.clearTimeout(timer)
  }, [delayMs])

  if (!visible) return null

  const px = Math.max(22, Math.min(size, 52))
  const border = Math.max(2, Math.round(px / 11))

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '6px 0',
      }}
      aria-live="polite"
      aria-busy="true"
    >
      <div
        role="status"
        aria-label={label}
        className="btbiz-spinner"
        style={{
          width: px,
          height: px,
          borderWidth: border,
        }}
      />
      {label ? (
        <span style={{ fontSize: 12, color: '#64748b', textAlign: 'center', maxWidth: 280 }}>{label}</span>
      ) : null}
    </div>
  )
}
