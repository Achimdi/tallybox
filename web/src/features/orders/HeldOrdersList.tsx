import { CirclePause } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import type { HeldOrder } from '@/api/types'
import { Button } from '@/components/Button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Money } from '@/components/Money'
import { SkeletonList } from '@/components/Skeleton'
import { EmptyState, ErrorState } from '@/components/states'
import { useToast } from '@/components/toast-context'
import { useSessionUser } from '@/features/auth/session'
import { formatTime } from '@/lib/dates'
import { useOnlineStatus } from '@/lib/useOnlineStatus'
import { useDiscardHeldOrder, useHeldOrders } from './api'
import { cartIsEmpty, loadHeldIntoCart } from './cartStore'
import { portalBase } from './portal'

export function itemCount(lines: readonly { quantity: number }[]): string {
  const count = lines.reduce((sum, line) => sum + line.quantity, 0)
  return `${count} ${count === 1 ? 'item' : 'items'}`
}

/**
 * Held orders with Resume and Discard. Staff see their own; the owner sees
 * everyone's, with who held each one.
 */
export function HeldOrdersList() {
  const user = useSessionUser()
  const currency = user.currencyCode ?? 'NGN'
  const timezone = user.timezone ?? 'UTC'
  const base = portalBase(user.role)
  const navigate = useNavigate()
  const toast = useToast()
  const online = useOnlineStatus()
  const held = useHeldOrders()
  const discard = useDiscardHeldOrder()
  const [toDiscard, setToDiscard] = useState<HeldOrder | null>(null)
  const [toResume, setToResume] = useState<HeldOrder | null>(null)

  const resume = (hold: HeldOrder) => {
    loadHeldIntoCart(user.id, hold)
    void navigate(`${base}/new-order`)
  }

  const askToResume = (hold: HeldOrder) => {
    if (cartIsEmpty(user.id)) resume(hold)
    else setToResume(hold)
  }

  const confirmDiscard = () => {
    if (!toDiscard) return
    discard.mutate(toDiscard.id, {
      onSuccess: () => toast({ title: 'Held order discarded', tone: 'success' }),
      onError: () =>
        toast({ title: "Couldn't discard it", description: 'Try again.', tone: 'error' }),
      onSettled: () => setToDiscard(null),
    })
  }

  let content
  if (held.isPending) {
    content = <SkeletonList rows={2} label="Loading held orders" />
  } else if (held.isError) {
    content = (
      <div className="rounded-card border border-line bg-surface-raised">
        <ErrorState error={held.error} onRetry={() => void held.refetch()} />
      </div>
    )
  } else if (held.data.length === 0) {
    content = (
      <div className="rounded-card border border-line bg-surface-raised">
        <EmptyState
          title="No held orders"
          description="Hold an order on New order while you wait for a payment to arrive."
        />
      </div>
    )
  } else {
    content = (
      <ul className="flex flex-col gap-3">
        {held.data.map((hold) => (
          <li
            key={hold.id}
            className="flex flex-col gap-3 rounded-card border border-line bg-surface-raised p-4 shadow-soft"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <CirclePause aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-info" />
                <div className="flex min-w-0 flex-col">
                  <span className="text-body font-medium break-words text-ink">
                    {hold.customerName ?? 'Held order'}
                  </span>
                  <span className="text-label font-normal text-ink-muted">
                    {[
                      `Held ${formatTime(new Date(hold.updatedAt), timezone)}`,
                      itemCount(hold.lines),
                      user.role === 'owner' ? hold.staffName : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                  {hold.note ? (
                    <span className="text-label font-normal break-words text-ink-muted">
                      {hold.note}
                    </span>
                  ) : null}
                </div>
              </div>
              <Money
                minor={hold.total}
                currency={currency}
                className="shrink-0 font-semibold text-ink"
              />
            </div>
            <div className="flex gap-3">
              <Button onClick={() => askToResume(hold)} className="flex-1">
                Resume
              </Button>
              <Button variant="secondary" onClick={() => setToDiscard(hold)} disabled={!online}>
                Discard
              </Button>
            </div>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <>
      {content}
      <ConfirmDialog
        open={toDiscard !== null}
        onOpenChange={(open) => {
          if (!open) setToDiscard(null)
        }}
        title="Discard this held order?"
        description="It is removed for good. No stock was taken for it, so nothing else changes."
        confirmLabel="Discard"
        tone="danger"
        loading={discard.isPending}
        onConfirm={confirmDiscard}
      />
      <ConfirmDialog
        open={toResume !== null}
        onOpenChange={(open) => {
          if (!open) setToResume(null)
        }}
        title="Replace the current cart?"
        description="The cart on New order has items in it. Resuming this held order replaces them."
        confirmLabel="Replace cart"
        onConfirm={() => {
          if (toResume) resume(toResume)
          setToResume(null)
        }}
      />
    </>
  )
}
