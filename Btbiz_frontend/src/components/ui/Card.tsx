import type { FC, ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
}

export const Card: FC<CardProps> = ({ children, className = '' }) => {
  return (
    <section className={`ui-card ${className}`}>
      {children}
    </section>
  )
}


