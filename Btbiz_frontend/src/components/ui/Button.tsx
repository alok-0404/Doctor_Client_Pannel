import type { ButtonHTMLAttributes, FC, ReactNode } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  variant?: 'primary' | 'secondary'
}

export const Button: FC<ButtonProps> = ({
  children,
  variant = 'primary',
  className = '',
  ...props
}) => {
  const variantClass = variant === 'secondary' ? 'ui-button-secondary' : 'ui-button-primary'

  return (
    <button
      type="button"
      className={`ui-button ${variantClass} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}


