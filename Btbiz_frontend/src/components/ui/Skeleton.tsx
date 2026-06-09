import type { CSSProperties, FC } from 'react'

interface SkeletonProps {
  variant?: 'text' | 'rect' | 'circle'
  width?: string | number
  height?: string | number
  lines?: number
  className?: string
}

const toCssSize = (size: string | number | undefined): string | undefined => {
  if (size === undefined) return undefined
  return typeof size === 'number' ? `${size}px` : size
}

export const Skeleton: FC<SkeletonProps> = ({
  variant = 'text',
  width,
  height,
  lines = 1,
  className = '',
}) => {
  const style: CSSProperties = {
    width: toCssSize(width),
    height: toCssSize(height),
  }

  if (variant === 'text' && lines > 1) {
    return (
      <div className={`ui-skeleton-group ${className}`.trim()} aria-hidden="true">
        {Array.from({ length: lines }, (_, index) => (
          <span
            key={index}
            className={`ui-skeleton ui-skeleton--text${index === lines - 1 ? ' ui-skeleton--text-short' : ''}`}
            style={index === 0 ? style : undefined}
          />
        ))}
      </div>
    )
  }

  return (
    <span
      className={`ui-skeleton ui-skeleton--${variant} ${className}`.trim()}
      style={style}
      aria-hidden="true"
    />
  )
}
