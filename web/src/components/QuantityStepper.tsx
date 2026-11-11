import { Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/cn'

interface QuantityStepperProps {
  value: number
  onChange: (value: number) => void
  /** What is being counted, for screen readers: "Quantity of Paracetamol". */
  label: string
  min?: number
  /** Usually the stock on hand. */
  max?: number
  disabled?: boolean
  className?: string
}

const STEP_BUTTON =
  'flex size-12 items-center justify-center rounded-control text-ink transition-colors duration-150 ' +
  'enabled:hover:bg-surface-sunken enabled:active:bg-line disabled:cursor-not-allowed disabled:opacity-40'

/** Minus and plus buttons around a quantity. Whole numbers only. */
export function QuantityStepper({
  value,
  onChange,
  label,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  disabled = false,
  className,
}: QuantityStepperProps) {
  const clamp = (next: number) => Math.min(max, Math.max(min, next))

  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        'inline-flex items-center rounded-control border border-line-control bg-surface-raised',
        className,
      )}
    >
      <button
        type="button"
        aria-label="Decrease"
        disabled={disabled || value <= min}
        onClick={() => onChange(clamp(value - 1))}
        className={STEP_BUTTON}
      >
        <Minus aria-hidden="true" className="size-5" />
      </button>
      <output
        aria-live="polite"
        className="min-w-10 text-center text-body-lg font-semibold tabular-nums"
      >
        {value}
      </output>
      <button
        type="button"
        aria-label="Increase"
        disabled={disabled || value >= max}
        onClick={() => onChange(clamp(value + 1))}
        className={STEP_BUTTON}
      >
        <Plus aria-hidden="true" className="size-5" />
      </button>
    </div>
  )
}
