export interface BarRow {
  key: string
  label: string
  value: number
  valueText: string
  /** Under the label, for example "12 orders". */
  detail?: string
}

/**
 * A ranked list where each row carries a thin bar for its share of the largest
 * value. The numbers are always written out, so the bar is never the only way
 * to read them.
 */
export function BarList({ rows, label }: { rows: readonly BarRow[]; label: string }) {
  const max = Math.max(0, ...rows.map((row) => row.value))
  return (
    <ul aria-label={label} className="flex flex-col gap-3">
      {rows.map((row) => (
        <li key={row.key} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 text-body break-words text-ink">
              {row.label}
              {row.detail ? (
                <span className="text-label font-normal text-ink-muted"> · {row.detail}</span>
              ) : null}
            </span>
            <span className="shrink-0 text-body font-semibold text-ink tabular-nums">
              {row.valueText}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-sunken" aria-hidden="true">
            <div
              className="h-full rounded-full bg-primary"
              style={{
                width:
                  max > 0 ? `${Math.max(row.value > 0 ? 1 : 0, (row.value / max) * 100)}%` : '0%',
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}
