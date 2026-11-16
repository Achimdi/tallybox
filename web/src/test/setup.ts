import * as matchers from '@testing-library/jest-dom/matchers'
// Types only (toBeInTheDocument and friends on `expect`).
import type {} from '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach, expect } from 'vitest'
import { resetCarts } from '@/features/orders/cartStore'

// Registered by hand rather than by importing '@testing-library/jest-dom/vitest'.
// On Windows that import can load a second copy of Vitest when the terminal's
// drive letter is lower-case (c:\ instead of C:\, which VS Code often uses),
// and then the matchers land on the wrong copy.
expect.extend(matchers)

// Screens on the demo data layer can take a moment when the whole suite runs in
// parallel, especially straight after lint and type-checking in `npm run check`.
// Wait up to 8 seconds for them (failures still fail, just later).
configure({ asyncUtilTimeout: 8000 })

afterEach(() => {
  cleanup()
  resetCarts()
  window.localStorage.clear()
  window.sessionStorage.clear()
})

// jsdom has no matchMedia. The app uses it to detect an installed PWA.
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })
}

// jsdom has no canvas drawing. Say so quietly (receipts then take their
// "couldn't be made" path) instead of printing "Not implemented" errors.
HTMLCanvasElement.prototype.getContext = (() =>
  null) as typeof HTMLCanvasElement.prototype.getContext
