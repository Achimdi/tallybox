import { useId } from 'react'
import { cn } from '@/lib/cn'

export interface RadioCardOption<Value extends string> {
  value: Value
  label: string
  description?: string
}

interface RadioCardsProps<Value extends string> {
  legend: string
  description?: string
  value: Value
  options: readonly RadioCardOption<Value>[]
  onChange: (value: Value) => void
  className?: string
}

/**
 * Pick one of a few choices: large cards, each one tappable as a whole, styled
 * like CheckboxField. A real radio group, so arrow keys move between choices.
 */
export function RadioCards<Value extends string>({
  legend,
  description,
  value,
  options,
  onChange,
  className,
}: RadioCardsProps<Value>) {
  const id = useId()
  return (
    <fieldset
      className={cn('flex flex-col gap-2', className)}
      aria-describedby={description ? `${id}-description` : undefined}
    >
      <legend className="mb-1 text-label text-ink">{legend}</legend>
      {description ? (
        <p id={`${id}-description`} className="-mt-1 text-label font-normal text-ink-muted">
          {description}
        </p>
      ) : null}
      {options.map((option) => {
        const optionId = `${id}-${option.value}`
        const checked = option.value === value
        return (
          <label
            key={option.value}
            htmlFor={optionId}
            className={cn(
              'flex min-h-14 cursor-pointer items-start gap-3 rounded-control border-2 p-3 transition-colors duration-150',
              checked ? 'border-primary bg-primary-soft' : 'border-line-control bg-surface-raised',
            )}
          >
            <input
              id={optionId}
              type="radio"
              name={id}
              value={option.value}
              checked={checked}
              onChange={() => onChange(option.value)}
              aria-describedby={option.description ? `${optionId}-description` : undefined}
              className="mt-0.5 size-6 shrink-0 accent-[var(--tb-primary)]"
            />
            <span className="flex flex-col">
              <span className="text-body font-semibold text-ink">{option.label}</span>
              {option.description ? (
                <span
                  id={`${optionId}-description`}
                  className="text-label font-normal text-ink-muted"
                >
                  {option.description}
                </span>
              ) : null}
            </span>
          </label>
        )
      })}
    </fieldset>
  )
}
