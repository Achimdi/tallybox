import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { cn } from '@/lib/cn'

export interface Column {
  key: string
  /** Short label under the column, for example "Mon 9". */
  label: string
  /** Full label for the tooltip and table, for example "Mon, 9 Nov 2026". */
  fullLabel: string
  value: number
  valueText: string
  /** A second line in the tooltip, for example "12 orders". */
  detail?: string
}

interface ColumnChartProps {
  /** Names the chart for screen readers, for example "Sales by day". */
  title: string
  columns: readonly Column[]
  /** Axis labels: short, like ₦12K. */
  formatTick: (value: number) => string
  height?: number
}

const AXIS_WIDTH = 52
const BOTTOM = 28
const TOP = 8
const BAR_MAX = 24

/** Clean axis steps: 1, 2 or 5 times a power of ten. */
function niceTicks(max: number): number[] {
  if (max <= 0) return [0]
  const rough = max / 4
  const power = 10 ** Math.floor(Math.log10(rough))
  const step =
    [1, 2, 5, 10].map((factor) => factor * power).find((candidate) => candidate >= rough) ?? rough
  const ticks: number[] = []
  for (let value = 0; value <= max + step * 0.001; value += step) ticks.push(value)
  if ((ticks.at(-1) ?? 0) < max) ticks.push((ticks.at(-1) ?? 0) + step)
  return ticks
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(640)
  useEffect(() => {
    const element = ref.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(240, Math.round(entry.contentRect.width)))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

/**
 * A single-series column chart in plain SVG. Hover or tap a column (or use the
 * arrow keys) for its exact value; the same numbers are in a table under it.
 */
export function ColumnChart({ title, columns, formatTick, height = 220 }: ColumnChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)
  const tooltipId = useId()

  const ticks = niceTicks(Math.max(0, ...columns.map((column) => column.value)))
  const top = ticks.at(-1) || 1
  const plotWidth = width - AXIS_WIDTH
  const plotHeight = height - BOTTOM - TOP
  const slot = plotWidth / Math.max(1, columns.length)
  const barWidth = Math.max(2, Math.min(BAR_MAX, slot * 0.6))
  // Show only as many x labels as fit side by side.
  const labelEvery = Math.max(
    1,
    Math.ceil(columns.length / Math.max(1, Math.floor(plotWidth / 56))),
  )
  const y = (value: number) => TOP + plotHeight - (value / top) * plotHeight
  const shown = active === null ? null : columns[active]

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (columns.length === 0) return
    const last = columns.length - 1
    const moves: Record<string, number> = {
      ArrowRight: Math.min(last, (active ?? -1) + 1),
      ArrowLeft: Math.max(0, (active ?? columns.length) - 1),
      Home: 0,
      End: last,
    }
    const next = moves[event.key]
    if (next === undefined) {
      if (event.key === 'Escape') setActive(null)
      return
    }
    event.preventDefault()
    setActive(next)
  }

  return (
    <div ref={ref} className="relative w-full">
      <div
        role="group"
        tabIndex={0}
        aria-label={`${title}. Use the arrow keys to read each value.`}
        aria-describedby={shown ? tooltipId : undefined}
        onKeyDown={onKeyDown}
        onBlur={() => setActive(null)}
        onPointerLeave={() => setActive(null)}
        className="focus-visible:ring-focus rounded-control outline-none focus-visible:ring-2"
      >
        <svg width={width} height={height} aria-hidden="true" className="block overflow-visible">
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={AXIS_WIDTH}
                x2={width}
                y1={y(tick) + 0.5}
                y2={y(tick) + 0.5}
                className="stroke-line"
                strokeWidth={1}
              />
              <text
                x={AXIS_WIDTH - 8}
                y={y(tick)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-ink-muted text-caption tabular-nums"
              >
                {formatTick(tick)}
              </text>
            </g>
          ))}
          {columns.map((column, index) => {
            const x = AXIS_WIDTH + slot * index + (slot - barWidth) / 2
            const barHeight = Math.max(0, TOP + plotHeight - y(column.value))
            const radius = Math.min(4, barHeight, barWidth / 2)
            const base = TOP + plotHeight
            return (
              <g key={column.key}>
                {/* The whole slot is the hover target, bigger than the bar. */}
                <rect
                  x={AXIS_WIDTH + slot * index}
                  y={TOP}
                  width={slot}
                  height={plotHeight}
                  fill="transparent"
                  onPointerEnter={() => setActive(index)}
                  onPointerDown={() => setActive(index)}
                />
                {barHeight > 0 ? (
                  <path
                    pointerEvents="none"
                    className={cn(
                      'fill-primary transition-opacity',
                      active !== null && active !== index && 'opacity-50',
                    )}
                    d={`M${x},${base} V${base - barHeight + radius} Q${x},${base - barHeight} ${x + radius},${base - barHeight} H${x + barWidth - radius} Q${x + barWidth},${base - barHeight} ${x + barWidth},${base - barHeight + radius} V${base} Z`}
                  />
                ) : null}
                {index % labelEvery === 0 ? (
                  <text
                    x={AXIS_WIDTH + slot * index + slot / 2}
                    y={height - 8}
                    textAnchor="middle"
                    className="fill-ink-muted text-caption"
                  >
                    {column.label}
                  </text>
                ) : null}
              </g>
            )
          })}
        </svg>
      </div>
      {shown && active !== null ? (
        <div
          id={tooltipId}
          role="status"
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-control border border-line bg-surface-raised px-3 py-2 text-left shadow-raised"
          style={{
            left: Math.min(width - 70, Math.max(70, AXIS_WIDTH + slot * active + slot / 2)),
            top: Math.max(56, y(shown.value) - 6),
          }}
        >
          <p className="text-caption whitespace-nowrap text-ink-muted">{shown.fullLabel}</p>
          <p className="text-label whitespace-nowrap text-ink tabular-nums">{shown.valueText}</p>
          {shown.detail ? (
            <p className="text-caption whitespace-nowrap text-ink-muted">{shown.detail}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
