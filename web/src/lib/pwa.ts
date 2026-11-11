import { readStored, writeStored } from './storage'
import { APP_VERSION } from './version'

const HARD_REFRESH_KEY = 'tb.hard-refresh'

/** True if this tab already tried a hard refresh for the running version. */
export function hardRefreshAlreadyTried(): boolean {
  return readStored('session', HARD_REFRESH_KEY) === APP_VERSION
}

/**
 * Last resort when a required update has not arrived the normal way: remove the
 * service worker and its cached app shell, then reload from the network.
 *
 * It runs at most once per tab for a given version, so it can never loop.
 * Only the cached app shell is cleared. No business data is stored on the device.
 */
export async function hardRefresh(): Promise<void> {
  if (hardRefreshAlreadyTried()) return
  writeStored('session', HARD_REFRESH_KEY, APP_VERSION)
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((registration) => registration.unregister()))
    }
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((key) => caches.delete(key)))
    }
  } catch {
    // Reload anyway.
  }
  window.location.reload()
}

/** True when the app is running as an installed app, not in a browser tab. */
export function isStandalone(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
  return iosStandalone || window.matchMedia('(display-mode: standalone)').matches
}

/** iPhone and iPad have no install prompt, so they need written instructions. */
export function isIos(): boolean {
  const ua = navigator.userAgent
  const iPadOs = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1
  return /iPhone|iPad|iPod/.test(ua) || iPadOs
}
