import { WifiOff } from 'lucide-react'
import { useOnlineStatus } from '@/lib/useOnlineStatus'

/**
 * Tallybox needs the internet. While offline, this banner says so, and screens
 * disable the actions that need the server.
 */
export function OfflineBanner() {
  const online = useOnlineStatus()
  return (
    // The live region is always in the page so the change is announced.
    <div role="status" aria-live="polite" className="no-print sticky top-0 z-40">
      {online ? null : (
        <div className="flex items-center justify-center gap-2 bg-grey-900 px-4 py-2.5 text-label text-white">
          <WifiOff aria-hidden="true" className="size-4 shrink-0" />
          <span>You&apos;re offline. Orders and stock changes are paused until you reconnect.</span>
        </div>
      )}
    </div>
  )
}
