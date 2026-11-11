import { cn } from '@/lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'md' | 'lg'

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-control font-semibold select-none ' +
  'transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 ' +
  'aria-disabled:cursor-not-allowed aria-disabled:opacity-50'

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-on-primary enabled:hover:bg-primary-hover enabled:active:bg-primary-pressed',
  secondary:
    'border border-line-control bg-surface-raised text-ink enabled:hover:bg-surface-sunken enabled:active:bg-line',
  ghost:
    'text-primary enabled:hover:bg-primary-soft enabled:active:bg-teal-100 enabled:active:text-primary-pressed',
  danger: 'bg-error text-white enabled:hover:bg-error-strong enabled:active:bg-error-strong',
}

// Both sizes meet the 48px minimum touch target.
const SIZES: Record<ButtonSize, string> = {
  md: 'min-h-12 px-5 text-body',
  lg: 'min-h-14 px-6 text-body-lg',
}

interface ButtonStyleOptions {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
}

/** Shared look for <Button> and for links that should look like buttons. */
export function buttonClasses({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
}: ButtonStyleOptions = {}): string {
  return cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && 'w-full')
}
