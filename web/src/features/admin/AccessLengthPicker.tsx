import { FilterChips } from '@/components/FilterChips'
import { TextField } from '@/components/TextField'
import { ACCESS_CHOICES, type AccessChoice } from './access'

interface AccessLengthPickerProps {
  label: string
  hint?: string
  choice: AccessChoice
  customDays: string
  onChoiceChange: (choice: AccessChoice) => void
  onCustomDaysChange: (value: string) => void
  /** Shown under the custom number when it is not valid. */
  customError?: string | undefined
}

/** Presets (30, 90, 180, 365 days), a custom number of days, or open-ended. */
export function AccessLengthPicker({
  label,
  hint,
  choice,
  customDays,
  onChoiceChange,
  onCustomDaysChange,
  customError,
}: AccessLengthPickerProps) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-label text-ink">{label}</legend>
      <FilterChips
        label={label}
        options={ACCESS_CHOICES}
        value={choice}
        onChange={onChoiceChange}
      />
      {hint ? <p className="text-label font-normal text-ink-muted">{hint}</p> : null}
      {choice === 'custom' ? (
        <TextField
          label="Number of days"
          type="number"
          inputMode="numeric"
          min={1}
          max={3650}
          value={customDays}
          onChange={(event) => onCustomDaysChange(event.target.value)}
          error={customError}
        />
      ) : null}
    </fieldset>
  )
}
