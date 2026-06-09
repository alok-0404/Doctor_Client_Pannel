import type { ButtonHTMLAttributes, FC, ReactNode } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  variant?: 'primary' | 'secondary'
  /** Compact padding — matches existing `.ui-button-sm` utility. */
  size?: 'sm' | 'md'
  /** Stretch to container width. */
  fullWidth?: boolean
}

export const Button: FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
  type = 'button',
  ...props
}) => {
  const variantClass = variant === 'secondary' ? 'ui-button-secondary' : 'ui-button-primary'
  const sizeClass = size === 'sm' ? 'ui-button-sm' : ''
  const widthClass = fullWidth ? 'ui-button--full-width' : ''

  return (
    <button
      type={type}
      className={`ui-button ${variantClass} ${sizeClass} ${widthClass} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  )
}


