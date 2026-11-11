import type { ComponentProps, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router'
import { cn } from '@/lib/cn'
import { buttonClasses, type ButtonSize, type ButtonVariant } from './button-styles'
import { Spinner } from './Spinner'

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Shows a spinner and blocks further taps, which also guards against double taps. */
  loading?: boolean
  /** Optional text while loading, for example "Saving…". */
  loadingLabel?: string
  leadingIcon?: ReactNode
  fullWidth?: boolean
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  loadingLabel,
  leadingIcon,
  fullWidth = false,
  type = 'button',
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
      className={cn(buttonClasses({ variant, size, fullWidth }), className)}
      {...rest}
    >
      {loading ? <Spinner /> : leadingIcon}
      <span>{loading && loadingLabel ? loadingLabel : children}</span>
    </button>
  )
}

export interface ButtonLinkProps extends LinkProps {
  variant?: ButtonVariant
  size?: ButtonSize
  leadingIcon?: ReactNode
  fullWidth?: boolean
}

/** A navigation link that looks like a button. */
export function ButtonLink({
  variant = 'primary',
  size = 'md',
  leadingIcon,
  fullWidth = false,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link
      className={cn(
        buttonClasses({ variant, size, fullWidth }),
        // Links are never `disabled`, so hover styles are set without `enabled:`.
        variant === 'primary' && 'hover:bg-primary-hover active:bg-primary-pressed',
        variant === 'secondary' && 'hover:bg-surface-sunken active:bg-line',
        variant === 'ghost' && 'hover:bg-primary-soft',
        className,
      )}
      {...rest}
    >
      {leadingIcon}
      <span>{children}</span>
    </Link>
  )
}
