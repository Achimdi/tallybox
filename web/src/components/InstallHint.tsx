import { Download, Smartphone, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/cn'
import { isIos, isStandalone } from '@/lib/pwa'
import { readStored, writeStored } from '@/lib/storage'
import { Button } from './Button'

/** Chrome, Edge and Android browsers fire this when the app can be installed. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISSED_KEY = 'tb.install-hint.dismissed'

/**
 * A gentle "add Tallybox to your home screen" hint.
 * - Chrome, Edge, Android: shows an Install button that opens the browser's own prompt.
 * - iPhone and iPad: shows the two steps, because Safari has no install prompt.
 * - Already installed, or dismissed before: shows nothing.
 */
export function InstallHint({ className }: { className?: string }) {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [hidden, setHidden] = useState(
    () => isStandalone() || readStored('local', DISMISSED_KEY) === '1',
  )
  const [showIosSteps] = useState(() => isIos())

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      // Stop the browser's own mini-banner so the hint can offer it instead.
      event.preventDefault()
      setInstallEvent(event as BeforeInstallPromptEvent)
    }
    const onInstalled = () => setHidden(true)
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (hidden || (!installEvent && !showIosSteps)) return null

  const dismiss = () => {
    writeStored('local', DISMISSED_KEY, '1')
    setHidden(true)
  }

  const install = async () => {
    if (!installEvent) return
    await installEvent.prompt()
    const choice = await installEvent.userChoice
    setInstallEvent(null)
    if (choice.outcome === 'accepted') setHidden(true)
  }

  return (
    <aside
      aria-label="Install Tallybox"
      className={cn(
        'flex items-start gap-3 rounded-card border border-line bg-surface-raised py-2 pr-2 pl-4',
        className,
      )}
    >
      <Smartphone aria-hidden="true" className="mt-3 size-5 shrink-0 text-primary" />
      <div className="flex min-w-0 flex-1 flex-col gap-2 py-2.5">
        <p className="text-body font-semibold text-ink">Add Tallybox to your home screen</p>
        {installEvent ? (
          <>
            <p className="text-label font-normal text-ink-muted">
              It opens like an app, with no app store needed.
            </p>
            <div>
              <Button
                variant="secondary"
                onClick={() => void install()}
                leadingIcon={<Download aria-hidden="true" className="size-5" />}
              >
                Install
              </Button>
            </div>
          </>
        ) : (
          <p className="text-label font-normal text-ink-muted">
            In Safari, tap the Share button, then choose &ldquo;Add to Home Screen&rdquo;.
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss install hint"
        className="flex size-12 shrink-0 items-center justify-center rounded-control text-ink-muted hover:bg-surface-sunken hover:text-ink"
      >
        <X aria-hidden="true" className="size-5" />
      </button>
    </aside>
  )
}
