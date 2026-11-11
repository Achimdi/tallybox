import type { Dispatch, SetStateAction } from 'react'

/**
 * Test stand-in for `virtual:pwa-register/react`.
 * That module only exists inside a real Vite build, so unit tests use this
 * "no service worker, no update waiting" version instead (see vite.config.ts).
 */

const noopSetter: Dispatch<SetStateAction<boolean>> = () => undefined
const needRefresh: [boolean, Dispatch<SetStateAction<boolean>>] = [false, noopSetter]
const offlineReady: [boolean, Dispatch<SetStateAction<boolean>>] = [false, noopSetter]
const updateServiceWorker = (): Promise<void> => Promise.resolve()

export function useRegisterSW() {
  return { needRefresh, offlineReady, updateServiceWorker }
}
