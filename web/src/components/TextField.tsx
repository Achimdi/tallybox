import { CircleExclamationPoint } from 'lucide-react'
import { useId, type ComponentProps, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface TextFieldProps extends ComponentProps<'input'> {
  label: string
  /** Helper text under the field. */
  hint?: string
  /** Validation message. When set, the field is marked invalid. */
  error?: string | undefined
  /** Something inside the right edge of the field, for example a show/hide button. */
  trailing?: ReactNode
  /** Marks the label "(optional)", the counterpart of "(required)". */
  optional?: boolean
}

/**
 * A labelled text input with hint and validation message.
 * Works with react-hook-form: <TextField label="Name" {...register('name')} error={errors.name?.message} />
 */
export function TextField({
  label,
  hint,
  error,
  trailing,
  id,
  className,
  required,
  optional = false,
  ...rest
}: TextFieldProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const hintId = `${inputId}-hint`
  const errorId = `${inputId}-error`
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ')

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={inputId} className="text-label text-ink">
        {label}
        {required ? <span className="font-normal text-ink-muted"> (required)</span> : null}
        {optional && !required ? (
          <span className="font-normal text-ink-muted"> (optional)</span>
        ) : null}
      </label>
      <div className="relative">
        <input
          id={inputId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={cn(
            'min-h-12 w-full rounded-control border bg-surface-raised px-4 text-ink placeholder:text-ink-subtle',
            'transition-colors duration-150 disabled:bg-surface-sunken disabled:text-ink-muted',
            error ? 'border-2 border-error' : 'border-line-control hover:border-ink-muted',
            trailing ? 'pr-14' : undefined,
          )}
          {...rest}
        />
        {trailing ? (
          <div className="absolute inset-y-0 right-0 flex items-center pr-1">{trailing}</div>
        ) : null}
      </div>
      {hint ? (
        <p id={hintId} className="text-label font-normal text-ink-muted">
          {hint}
        </p>
      ) : null}
      {/* Always in the page so screen readers announce the message when it appears. */}
      <p
        id={errorId}
        aria-live="polite"
        className={cn(
          'flex items-start gap-1.5 text-label font-medium text-error-strong',
          !error && 'hidden',
        )}
      >
        {error ? (
          <>
            <CircleExclamationPoint aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </>
        ) : null}
      </p>
    </div>
  )
}
