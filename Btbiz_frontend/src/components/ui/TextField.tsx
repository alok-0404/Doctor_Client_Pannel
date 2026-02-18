import { useState, type FC, type InputHTMLAttributes, type ReactNode } from 'react'

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  id: string
  hint?: string
  leftIcon?: ReactNode
  canTogglePassword?: boolean
}

export const TextField: FC<TextFieldProps> = ({
  label,
  id,
  hint,
  leftIcon,
  canTogglePassword = false,
  className = '',
  type,
  ...props
}) => {
  const hasIcon = Boolean(leftIcon)
  const [showPassword, setShowPassword] = useState(false)

  const inputType = canTogglePassword
    ? (showPassword ? 'text' : 'password')
    : type

  return (
    <div className="ui-textfield">
      <label
        htmlFor={id}
        className="ui-textfield-label"
      >
        {label}
      </label>
      <div className="ui-textfield-input-wrapper">
        {hasIcon && (
          <span className="ui-textfield-icon">
            {leftIcon}
          </span>
        )}
        <input
          id={id}
          type={inputType}
          className={`ui-textfield-input ${hasIcon ? 'with-icon' : ''} ${className}`}
          {...props}
        />
        {canTogglePassword && (
          <button
            type="button"
            className="ui-textfield-toggle"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? (
              // Eye-off icon
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                width="16"
                height="16"
                aria-hidden="true"
              >
                <path
                  fill="currentColor"
                  d="M3.53 2.47 2.47 3.53 5.3 6.36C3.37 7.59 2 9.39 1.25 10.6a1.91 1.91 0 0 0 0 1.8C3.07 15.48 6.3 18.5 12 18.5c2.03 0 3.77-.4 5.24-1.07l2.23 2.23 1.06-1.06-16-16ZM9.06 8.89 10.5 10.33A2.5 2.5 0 0 0 13.67 13.5l1.44 1.44A4 4 0 0 1 9.06 8.9ZM12 7a4 4 0 0 1 3.99 3.77l3.18 3.18c.86-.78 1.54-1.63 2.03-2.35a1.91 1.91 0 0 0 0-1.8C20.93 8.52 17.7 5.5 12 5.5c-.83 0-1.6.06-2.32.18l1.65 1.65A4 4 0 0 1 12 7Z"
                />
              </svg>
            ) : (
              // Eye icon
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                width="16"
                height="16"
                aria-hidden="true"
              >
                <path
                  fill="currentColor"
                  d="M12 5.5C6.3 5.5 3.07 8.52 1.25 11.4a1.91 1.91 0 0 0 0 1.8C3.07 16.48 6.3 19.5 12 19.5s8.93-3.02 10.75-6.3a1.91 1.91 0 0 0 0-1.8C20.93 8.52 17.7 5.5 12 5.5Zm0 10a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Zm0-5.5A2 2 0 1 0 14 12a2 2 0 0 0-2-2Z"
                />
              </svg>
            )}
          </button>
        )}
      </div>
      {hint && (
        <p className="ui-textfield-hint">
          {hint}
        </p>
      )}
    </div>
  )
}

