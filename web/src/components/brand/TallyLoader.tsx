import { cn } from '@/lib/cn'
import { TallyMark } from './TallyMark'

interface TallyLoaderProps {
  /** Read out by screen readers, and shown under the marks when `showLabel` is set. */
  label?: string
  showLabel?: boolean
  /** Fill the screen, for page-level loading. */
  fullPage?: boolean
  className?: string
}

/** The Tallybox loading indicator. */
export function TallyLoader({
  label = 'Loading',
  showLabel = false,
  fullPage = false,
  className,
}: TallyLoaderProps) {
  return (
    <div
      role="status"
      className={cn(
        'flex flex-col items-center justify-center gap-3 text-primary',
        fullPage ? 'min-h-dvh' : 'py-12',
        className,
      )}
    >
      <TallyMark animated />
      <span className={showLabel ? 'text-label text-ink-muted' : 'sr-only'}>{label}</span>
    </div>
  )
}
