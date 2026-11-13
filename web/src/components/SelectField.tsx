import { ChevronDown } from 'lucide-react'
import { useId, type ComponentProps } from 'react'
import { cn } from '@/lib/cn'

export interface SelectOption {
  value: string
  label: string
}

interface SelectFieldProps extends Omit<ComponentProps<'select'>, 'children'> {
  label: string
  options: readonly SelectOption[]
  hint?: string
  error?: string | undefined
}

/**
 * A labelled drop-down. The phone's own picker opens, which is the easiest
 * to use with a thumb.
 */
export function SelectField({
  label,
  options,
  hint,
  error,
  id,
  className,
  ...rest
}: SelectFieldProps) {
  const generatedId = useId()
  const selectId = id ?? generatedId
  const hintId = `${selectId}-hint`
  const errorId = `${selectId}-error`
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ')
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={selectId} className="text-label text-ink">
        {label}
      </label>
      <div className="relative">
        <select
          id={selectId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={cn(
            'min-h-12 w-full appearance-none rounded-control border bg-surface-raised pr-10 pl-4 text-ink',
            error ? 'border-2 border-error' : 'border-line-control hover:border-ink-muted',
          )}
          {...rest}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3 size-5 -translate-y-1/2 text-ink-muted"
        />
      </div>
      {hint ? (
        <p id={hintId} className="text-label font-normal text-ink-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-label font-medium text-error-strong">
          {error}
        </p>
      ) : null}
    </div>
  )
}
