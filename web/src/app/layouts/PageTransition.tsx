import { Suspense, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { TallyLoader } from '@/components/brand/TallyLoader'

/**
 * Wraps the changing part of a layout: shows the loader while a screen's code
 * downloads, and fades each new screen in (skipped for reduced-motion users).
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  return (
    <Suspense fallback={<TallyLoader />}>
      <div key={pathname} className="animate-page-in">
        {children}
      </div>
    </Suspense>
  )
}
