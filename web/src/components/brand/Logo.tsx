import { cn } from '@/lib/cn'

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
      <path
        d="M132 212v156a24 24 0 0 0 24 24h200a24 24 0 0 0 24-24V212"
        stroke="#fff"
        strokeWidth="28"
      />
      <path d="M196 164v160M236 164v160M276 164v160M316 164v160" stroke="#fff" strokeWidth="22" />
      <path d="M160 300 352 188" className="stroke-amber-400" strokeWidth="24" />
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
