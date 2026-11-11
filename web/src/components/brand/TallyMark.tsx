import { cn } from '@/lib/cn'

const MARKS = [10, 18, 26, 34] as const

interface TallyMarkProps {
  className?: string
  /** Animate the marks being drawn, for loading indicators. */
  animated?: boolean
}

/**
 * The tally motif: four marks and an amber strike.
 * Use sparingly: loading screen, empty states and the loading indicator.
 * Decorative, so it is hidden from screen readers.
 */
export function TallyMark({ className, animated = false }: TallyMarkProps) {
  return (
    <svg
      viewBox="0 0 44 40"
      fill="none"
      strokeLinecap="round"
      aria-hidden="true"
      className={cn('h-10 w-11', className)}
    >
      {MARKS.map((x, index) => (
        <path
          key={x}
          d={`M${x} 6v28`}
          stroke="currentColor"
          strokeWidth="3.5"
          pathLength={1}
          strokeDasharray={1}
          className={animated ? 'animate-tally' : undefined}
          style={animated ? { animationDelay: `${index * 120}ms` } : undefined}
        />
      ))}
      <path
        d="M4 30 40 10"
        strokeWidth="3.5"
        pathLength={1}
        strokeDasharray={1}
        className={cn('stroke-accent', animated && 'animate-tally')}
        style={animated ? { animationDelay: '480ms' } : undefined}
      />
    </svg>
  )
}
