import type { FC, ReactNode, CSSProperties } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  style?: CSSProperties
}

export const Card: FC<CardProps> = ({ children, className = '', style }) => {
  return (
    <section className={`ui-card ${className}`} style={style}>
      {children}
    </section>
  )
}


