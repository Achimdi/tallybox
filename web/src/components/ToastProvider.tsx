import { CircleCheck, CircleExclamationPoint, Info, X, type LucideIcon } from 'lucide-react'
import { Toast } from 'radix-ui'
import { useCallback, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { ToastContext, type ToastInput, type ToastTone } from './toast-context'

interface ActiveToast extends ToastInput {
  id: number
  open: boolean
}

const TONES: Record<ToastTone, { icon: LucideIcon; className: string }> = {
  success: { icon: CircleCheck, className: 'text-success' },
  error: { icon: CircleExclamationPoint, className: 'text-error-strong' },
  info: { icon: Info, className: 'text-info' },
}

const VISIBLE_MS = 5000
const EXIT_MS = 200

/** Wrap the app once. Then any component can call useToast(). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ActiveToast[]>([])
  const nextId = useRef(1)

  const showToast = useCallback((toast: ToastInput) => {
    const id = nextId.current
    nextId.current += 1
    // Keep at most three on screen so they never cover the page.
    setToasts((current) => [...current.slice(-2), { ...toast, id, open: true }])
  }, [])

  const close = useCallback((id: number) => {
    setToasts((current) =>
      current.map((toast) => (toast.id === id ? { ...toast, open: false } : toast)),
    )
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, EXIT_MS)
  }, [])

  return (
    <ToastContext value={showToast}>
      <Toast.Provider duration={VISIBLE_MS} swipeDirection="down" label="Notification">
        {children}
        {toasts.map((toast) => {
          const tone = TONES[toast.tone ?? 'info']
          const Icon = tone.icon
          return (
            <Toast.Root
              key={toast.id}
              open={toast.open}
              onOpenChange={(open) => {
                if (!open) close(toast.id)
              }}
              // Errors interrupt screen readers. Everything else waits its turn.
              type={toast.tone === 'error' ? 'foreground' : 'background'}
              className="flex items-start gap-3 rounded-card border border-line bg-surface-raised py-2 pr-2 pl-4 shadow-raised data-[state=closed]:animate-fade-out data-[state=open]:animate-sheet-up"
            >
              <Icon aria-hidden="true" className={cn('mt-3 size-5 shrink-0', tone.className)} />
              <div className="flex min-w-0 flex-1 flex-col py-2.5">
                <Toast.Title className="text-body font-semibold text-ink">
                  {toast.title}
                </Toast.Title>
                {toast.description ? (
                  <Toast.Description className="text-label font-normal text-ink-muted">
                    {toast.description}
                  </Toast.Description>
                ) : null}
              </div>
              <Toast.Close
                aria-label="Dismiss"
                className="flex size-12 shrink-0 items-center justify-center rounded-control text-ink-muted hover:bg-surface-sunken hover:text-ink"
              >
                <X aria-hidden="true" className="size-5" />
              </Toast.Close>
            </Toast.Root>
          )
        })}
        {/* Sits above the phone bottom bar, and in the corner on larger screens. */}
        <Toast.Viewport className="fixed inset-x-0 bottom-20 z-50 flex flex-col gap-2 px-4 outline-none md:inset-x-auto md:right-4 md:bottom-4 md:w-96 md:px-0" />
      </Toast.Provider>
    </ToastContext>
  )
}
