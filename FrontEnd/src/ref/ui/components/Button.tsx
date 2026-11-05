import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'ghost' | 'danger'
  icon?: ReactNode
  loading?: boolean
}

export function Button({
  variant = 'default',
  icon,
  loading = false,
  disabled,
  children,
  className = '',
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={`slc-btn slc-btn--${variant} ${className}`.trim()}
      disabled={disabled || loading}
      // Tells a screen reader the control is working, which a spinner alone does not.
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="slc-btn__spinner" aria-hidden="true" /> : icon}
      {children}
    </button>
  )
}
