import { cn } from '@/lib/cn'
import { MARK_PATHS } from './markPaths'

interface LogoSymbolProps {
  className?: string
}

/** The Tallybox symbol on its teal tile: open box, four tally marks, amber strike. */
export function LogoSymbol({ className }: LogoSymbolProps) {
  return (
    <svg
      viewBox="0 0 512 512"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn('size-10 rounded-[22%]', className)}
    >
      <rect width="512" height="512" className="fill-teal-600" />
      <path d={MARK_PATHS.box.d} stroke="#fff" strokeWidth={MARK_PATHS.box.width} />
      <path d={MARK_PATHS.tallies.d} stroke="#fff" strokeWidth={MARK_PATHS.tallies.width} />
      <path
        d={MARK_PATHS.strike.d}
        className="stroke-amber-400"
        strokeWidth={MARK_PATHS.strike.width}
      />
    </svg>
  )
}

interface LogoProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const SYMBOL_SIZE = { sm: 'size-8', md: 'size-10', lg: 'size-16' } as const
const WORD_SIZE = { sm: 'text-body-lg', md: 'text-title', lg: 'text-display' } as const

/** Horizontal lockup: symbol plus the word Tallybox. */
export function Logo({ size = 'md', className }: LogoProps) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoSymbol className={SYMBOL_SIZE[size]} />
      <span className={cn('font-bold tracking-tight text-ink', WORD_SIZE[size])}>Tallybox</span>
    </span>
  )
}
