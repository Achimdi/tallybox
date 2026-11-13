import { useCallback, useSyncExternalStore } from 'react'

/** True while the CSS media query matches, for example '(min-width: 768px)'. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  )
}

/** The tablet-and-up breakpoint used by the layouts (Tailwind's `md`). */
export const WIDE_SCREEN = '(min-width: 768px)'
