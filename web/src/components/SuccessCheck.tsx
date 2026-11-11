import { cn } from '@/lib/cn'

/** The animated tick shown when an order is confirmed. */
export function SuccessCheck({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 72 72" fill="none" aria-hidden="true" className={cn('size-18', className)}>
      <circle
        cx="36"
        cy="36"
        r="34"
        className="origin-center animate-check-ring fill-success-600 [transform-box:fill-box]"
      />
      <path
        d="M22 37.5 31.5 47 51 27"
        stroke="#fff"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray={1}
        className="animate-check-draw"
      />
    </svg>
  )
}
