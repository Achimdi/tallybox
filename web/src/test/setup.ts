import * as matchers from '@testing-library/jest-dom/matchers'
// Types only (toBeInTheDocument and friends on `expect`).
import type {} from '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, expect } from 'vitest'

// Registered by hand rather than by importing '@testing-library/jest-dom/vitest'.
// On Windows that import can load a second copy of Vitest when the terminal's
// drive letter is lower-case (c:\ instead of C:\, which VS Code often uses),
// and then the matchers land on the wrong copy.
expect.extend(matchers)

afterEach(() => {
  cleanup()
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
