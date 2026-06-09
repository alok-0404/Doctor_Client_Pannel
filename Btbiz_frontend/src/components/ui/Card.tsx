import type { FC, ReactNode, CSSProperties } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  style?: CSSProperties
  /** Stronger shadow — off by default to preserve existing layouts. */
  elevated?: boolean
  /** Subtle hover lift — off by default. */
  interactive?: boolean
}

export const Card: FC<CardProps> = ({
  children,
  className = '',
  style,
  elevated = false,
  interactive = false,
}) => {
  const modifiers = [
    elevated ? 'ui-card--elevated' : '',
    interactive ? 'ui-card--interactive' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <section className={`ui-card ${modifiers} ${className}`.trim()} style={style}>
      {children}
    </section>
  )
}


