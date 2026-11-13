import { cn } from '@/lib/cn'

export interface FilterOption<Value extends string> {
  value: Value
  label: string
  /** Shown after the label, for example how many items match. */
  count?: number
}

interface FilterChipsProps<Value extends string> {
  /** What the chips choose, for screen readers: "Filter businesses". */
  label: string
  options: readonly FilterOption<Value>[]
  value: Value
  onChange: (value: Value) => void
  className?: string
}

/**
 * A row of chips where exactly one is chosen, like category or status filters.
 * Scrolls sideways on narrow screens. Keyboard: Tab to the row, then Enter or
 * Space on a chip.
 */
export function FilterChips<Value extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: FilterChipsProps<Value>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        '-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0',
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex min-h-12 shrink-0 items-center gap-1.5 rounded-full border px-4 text-label whitespace-nowrap transition-colors duration-150',
              selected
                ? 'border-primary bg-primary text-on-primary'
                : 'border-line-control bg-surface-raised text-ink hover:bg-surface-sunken',
            )}
          >
            {option.label}
            {option.count !== undefined ? (
              <span
                className={cn(
                  'rounded-full px-1.5 text-caption font-semibold tabular-nums',
                  selected ? 'bg-teal-800 text-white' : 'bg-surface-sunken text-ink-muted',
                )}
              >
                {option.count}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
