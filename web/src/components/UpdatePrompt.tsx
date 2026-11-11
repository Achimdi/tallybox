import { RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { logger } from '@/lib/logger'
import { hardRefresh, hardRefreshAlreadyTried } from '@/lib/pwa'
import { APP_VERSION, fetchVersionFile, updateStatus, type UpdateStatus } from '@/lib/version'
import { TallyLoader } from './brand/TallyLoader'
import { Button } from './Button'

/** How often an open app asks the server whether a newer version exists. */
const CHECK_EVERY_MS = 30 * 60 * 1000
/** How long a required update may take before the last-resort hard refresh. */
const REQUIRED_UPDATE_TIMEOUT_MS = 10_000

/**
 * Keeps people on a current version of the app.
 *
 * How a deploy reaches someone who already has Tallybox open or installed:
 * 1. On start, when the tab regains focus, when the network returns and every
 *    30 minutes, the app re-checks the service worker and /version.json.
 * 2. Normal update: a small "New version available" card appears. Nothing is
 *    interrupted. Tapping Refresh switches to the new version.
 * 3. Required update (the running version is older than `minVersion`): a
 *    full-screen "Updating" message appears and the app updates by itself.
 */
export function UpdatePrompt() {
  const registrationRef = useRef<ServiceWorkerRegistration | undefined>(undefined)
  const [status, setStatus] = useState<UpdateStatus>('current')
  const [dismissed, setDismissed] = useState(false)
  const [applying, setApplying] = useState(false)

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_scriptUrl, registration) {
      registrationRef.current = registration
    },
    onRegisterError(error: unknown) {
      logger.error('sw_register_failed', error)
    },
  })

  useEffect(() => {
    // The dev server has no service worker and no version.json.
    if (import.meta.env.DEV) return

    let cancelled = false
    const check = async () => {
      if (document.visibilityState !== 'visible' || !navigator.onLine) return
      // Ask the browser to look for a new service worker (a new deploy).
      registrationRef.current?.update().catch(() => undefined)
      const file = await fetchVersionFile()
      if (cancelled || !file) return
      setStatus(updateStatus(APP_VERSION, file))
    }
    const run = () => void check()

    run()
    const interval = window.setInterval(run, CHECK_EVERY_MS)
    document.addEventListener('visibilitychange', run)
    window.addEventListener('online', run)
    return () => {
      cancelled = true
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', run)
      window.removeEventListener('online', run)
    }
  }, [])

  // Required update: apply it without asking.
  useEffect(() => {
    if (status !== 'required') return
    if (needRefresh) {
      void updateServiceWorker(true)
      return
    }
    const timer = window.setTimeout(() => void hardRefresh(), REQUIRED_UPDATE_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [status, needRefresh, updateServiceWorker])

  const refresh = () => {
    setApplying(true)
    if (needRefresh) {
      // Activates the waiting service worker, which then reloads the page.
      void updateServiceWorker(true)
      // Safety net in case that reload never comes.
      window.setTimeout(() => window.location.reload(), 4000)
    } else {
      window.location.reload()
    }
  }

  if (status === 'required') {
    return (
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="update-required-title"
        className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-2 bg-surface p-6 text-center"
      >
        <TallyLoader className="py-4" label="Updating" />
        <h2 id="update-required-title" className="text-title text-ink">
          Updating Tallybox
        </h2>
        <p className="max-w-sm text-body text-ink-muted">
          This version is out of date. The new one is loading and will open by itself.
        </p>
        {hardRefreshAlreadyTried() ? (
          <div className="mt-4 flex flex-col items-center gap-3">
            <p className="max-w-sm text-label font-normal text-ink-muted">
              Still here? Close every Tallybox tab or the installed app, then open it again.
            </p>
            <Button variant="secondary" onClick={() => window.location.reload()}>
              Try again
            </Button>
          </div>
        ) : null}
      </div>
    )
  }

  const updateWaiting = needRefresh || status === 'available'
  if (!updateWaiting || dismissed) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="no-print fixed inset-x-0 bottom-20 z-50 px-4 md:inset-x-auto md:right-4 md:bottom-4 md:w-96 md:px-0"
    >
      <div className="flex animate-sheet-up flex-col gap-3 rounded-card border border-line bg-surface-raised p-4 shadow-raised">
        <div className="flex flex-col">
          <p className="text-body font-semibold text-ink">New version available</p>
          <p className="text-label font-normal text-ink-muted">
            Refresh when you&apos;re ready. It only takes a moment.
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={refresh}
            loading={applying}
            leadingIcon={<RefreshCw aria-hidden="true" className="size-5" />}
          >
            Refresh
          </Button>
          <Button variant="ghost" onClick={() => setDismissed(true)} disabled={applying}>
            Later
          </Button>
        </div>
      </div>
    </div>
  )
}
