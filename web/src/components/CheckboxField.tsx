import { useId } from 'react'
import { cn } from '@/lib/cn'

interface CheckboxFieldProps {
  label: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  /** Draws attention: a coloured border once ticked. */
  emphasis?: boolean
  className?: string
}

/** A large, easy-to-hit checkbox with a label and an explanation. The whole box is tappable. */
export function CheckboxField({
  label,
  description,
  checked,
  onChange,
  disabled = false,
  emphasis = false,
  className,
}: CheckboxFieldProps) {
  const id = useId()
  const descriptionId = `${id}-description`
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex min-h-14 items-start gap-3 rounded-control border-2 p-3 transition-colors duration-150',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
        checked && emphasis
          ? 'border-success bg-success-soft'
          : 'border-line-control bg-surface-raised',
        className,
      )}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        aria-describedby={description ? descriptionId : undefined}
        className="mt-0.5 size-6 shrink-0 accent-[var(--tb-success)]"
      />
      <span className="flex flex-col">
        <span className="text-body font-semibold text-ink">{label}</span>
        {description ? (
          <span id={descriptionId} className="text-label font-normal text-ink-muted">
            {description}
          </span>
        ) : null}
      </span>
    </label>
  )
}
